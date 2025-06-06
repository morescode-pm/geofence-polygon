// Initialize the map with minimal controls
let map = L.map('map', {
    zoomControl: false,
    attributionControl: false
}).setView([0, 0], 2);

// Add zoom control to top-left
L.control.zoom({
    position: 'topleft'
}).addTo(map);

// Add attribution control to bottom-right
L.control.attribution({
    position: 'bottomright',
    prefix: '© OpenStreetMap contributors'
}).addTo(map);

// Add tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// Initialize the FeatureGroup to store editable layers
let drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

// Initialize draw control with minimal options
let drawControl = new L.Control.Draw({
    draw: {
        marker: false,
        circlemarker: false,
        circle: false,
        rectangle: false,
        polyline: false,
        polygon: {
            allowIntersection: false,
            drawError: {
                color: '#e1e100',
                message: '<strong>Error:</strong> Polygon edges cannot cross!'
            },
            shapeOptions: {
                color: '#3388ff'
            }
        }
    },
    edit: {
        featureGroup: drawnItems,
        remove: true
    },
    position: 'topleft'
});
map.addControl(drawControl);

// Global variables
let currentPolygon = null;
let lastSpeciesData = null;
let isLoadingMore = false;
let currentOffset = 0;
let totalOccurrences = 0;
let currentPolygonCoords = null;

// Configure toastr
toastr.options = {
    closeButton: true,
    progressBar: true,
    positionClass: "toast-top-right",
    timeOut: 5000
};

// Event handlers for drawing
map.on('draw:created', function(e) {
    drawnItems.clearLayers();
    currentPolygon = e.layer;
    drawnItems.addLayer(currentPolygon);
});

map.on('draw:edited', function(e) {
    let layers = e.layers;
    layers.eachLayer(function(layer) {
        currentPolygon = layer;
    });
});

map.on('draw:deleted', function(e) {
    currentPolygon = null;
});

// Function to show loading overlay
function showLoading() {
    document.getElementById('loadingOverlay').style.display = 'flex';
}

// Function to hide loading overlay
function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

// Function to search location using Nominatim
async function searchLocation() {
    const locationInput = document.getElementById('locationInput').value;
    if (!locationInput) {
        toastr.error('Please enter a location');
        return;
    }

    showLoading();
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationInput)}`);
        const data = await response.json();

        if (data && data.length > 0) {
            const location = data[0];
            map.setView([location.lat, location.lon], 13);
            toastr.success('Location found!');
        } else {
            toastr.error('Location not found');
        }
    } catch (error) {
        console.error('Error searching location:', error);
        toastr.error('Error searching location');
    } finally {
        hideLoading();
    }
}

// Function to get the most common name for a species
async function getMostCommonName(taxonKey, countryCode = null) {
    try {
        const response = await fetch(`https://api.gbif.org/v1/species/${taxonKey}/vernacularNames`);
        const data = await response.json();
        
        if (data && data.results && data.results.length > 0) {
            // First try to find an English name for the specific country
            if (countryCode) {
                const countryEnglishName = data.results.find(n => 
                    n.language === 'eng' && n.countryCode === countryCode);
                if (countryEnglishName) return countryEnglishName.vernacularName;
            }

            // Then try to find any name for the specific country
            if (countryCode) {
                const countryName = data.results.find(n => n.countryCode === countryCode);
                if (countryName) return countryName.vernacularName;
            }

            // Then try to find any English name
            const englishName = data.results.find(n => n.language === 'eng');
            if (englishName) return englishName.vernacularName;

            // Finally, just take the most preferred name
            const sortedNames = data.results.sort((a, b) => 
                (b.preferredCount || 0) - (a.preferredCount || 0));
            return sortedNames[0].vernacularName;
        }
        return null;
    } catch (error) {
        console.error('Error fetching vernacular name:', error);
        return null;
    }
}

// Function to batch fetch common names
async function fetchCommonNamesForBatch(species, countryCode = null) {
    const batchPromises = species.map(async (species) => {
        if (!species.mostCommonName) {  // Only fetch if we don't have it yet
            try {
                const commonName = await getMostCommonName(species.taxonKey, countryCode);
                return {
                    ...species,
                    mostCommonName: commonName
                };
            } catch (error) {
                console.error(`Error fetching common name for ${species.scientificName}:`, error);
                return species;
            }
        }
        return species;
    });

    return Promise.all(batchPromises);
}

// Function to get species in polygon from GBIF
async function getSpeciesInPolygon(polygonCoords, offset = 0, limit = 1000) {
    // Format polygon coordinates for GBIF
    const polygonStr = 'POLYGON((' + 
        polygonCoords.map(coord => `${coord[1]} ${coord[0]}`).join(',') +
        '))';

    const params = new URLSearchParams({
        geometry: polygonStr,
        limit: limit,
        offset: offset,
        kingdomKey: '1', // Animalia
        hasCoordinate: 'true',
        status: 'ACCEPTED',
        phylumKey: '44' // Include chordata
    });

    try {
        console.log(`Fetching GBIF data with offset ${offset}, limit ${limit}`);
        const response = await fetch(`https://api.gbif.org/v1/occurrence/search?${params}`);
        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            console.log('No results returned from GBIF');
            return { species: [], total: data.count || 0 };
        }

        // Get the most common country code from the results
        const countryCounts = {};
        data.results.forEach(result => {
            if (result.countryCode) {
                countryCounts[result.countryCode] = (countryCounts[result.countryCode] || 0) + 1;
            }
        });
        const mostCommonCountry = Object.entries(countryCounts)
            .sort(([,a], [,b]) => b - a)[0]?.[0] || null;

        if (offset === 0) {
            console.log(`Total occurrences found in area: ${data.count}`);
            console.log(`Most common country in area: ${mostCommonCountry || 'unknown'}`);
            toastr.info(`Found ${data.count.toLocaleString()} occurrences in the selected area`);
        }

        const speciesData = [];
        const processedTaxa = new Set();

        for (const result of data.results) {
            const taxonId = result.taxonKey;
            if (taxonId && 
                result.kingdom === 'Animalia' && 
                !processedTaxa.has(taxonId)) {
                
                speciesData.push({
                    scientificName: result.scientificName || 'Unknown species',
                    vernacularName: result.vernacularName || result.scientificName || 'Unknown species',
                    taxonKey: result.taxonKey,
                    kingdom: result.kingdom || 'Animalia',
                    phylum: result.phylum || '-',
                    class: result.class || '-',
                    order: result.order || '-',
                    species: result.species || result.scientificName || '-',
                    countryCode: mostCommonCountry
                });
                processedTaxa.add(taxonId);
            }
        }

        return { 
            species: speciesData, 
            total: data.count || 0,
            countryCode: mostCommonCountry
        };
    } catch (error) {
        console.error('Error fetching GBIF data:', error);
        throw error;
    }
}

// Function to sort species data
function sortSpeciesData(speciesData) {
    return speciesData.sort((a, b) => {
        if (a.scientificName && b.scientificName) {
            return a.scientificName.localeCompare(b.scientificName);
        }
        return 0;
    });
}

// Function to display species with load more button
async function displaySpecies(species, total = null, isAppending = false) {
    console.log('Displaying species data:', species);
    const speciesList = document.getElementById('speciesList');
    const speciesHeader = document.querySelector('.species-list-header');
    
    if (!species || species.length === 0) {
        console.log('No species data to display');
        speciesHeader.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <span>0 Species found within Geofence</span>
                <div class="d-flex gap-2">
                    <button class="btn btn-sm btn-info" onclick="downloadSpeciesList()">Download Species List</button>
                </div>
            </div>
        `;
        speciesHeader.classList.remove('d-none');
        speciesList.innerHTML = '<div class="species-item">No species found in this area.</div>';
        return;
    }

    // Create a Map to store unique species by taxonKey
    const uniqueSpecies = new Map();
    
    // If appending, include existing species from lastSpeciesData
    if (isAppending && lastSpeciesData) {
        lastSpeciesData.forEach(s => {
            if (!uniqueSpecies.has(s.taxonKey)) {
                uniqueSpecies.set(s.taxonKey, s);
            }
        });
    }
    
    // Add new species
    species.forEach(s => {
        if (!uniqueSpecies.has(s.taxonKey)) {
            uniqueSpecies.set(s.taxonKey, s);
        }
    });

    // Convert unique species back to array
    const uniqueSpeciesArray = Array.from(uniqueSpecies.values());
    console.log(`Unique species after deduplication: ${uniqueSpeciesArray.length}`);
    
    // Calculate total occurrences processed - start with 1000 for initial load
    const processedOccurrences = isAppending ? currentOffset + 1000 : 1000;
    
    // Create the base header content
    const baseHeaderContent = `
        <div class="d-flex justify-content-between align-items-center">
            <span>${uniqueSpeciesArray.length} Species found within Geofence${total ? ` (${processedOccurrences.toLocaleString()} occurrences processed)` : ''}</span>
            <div class="d-flex gap-2">
                <button class="btn btn-sm btn-info" onclick="downloadSpeciesList()">Download Species List</button>
                ${total && currentOffset < total ? 
                    `<button class="btn btn-sm btn-primary" id="loadMoreBtn" onclick="loadMoreSpecies()" style="min-width: 120px;">
                        Load More (${(total - currentOffset).toLocaleString()} remaining)
                    </button>` : ''}
            </div>
        </div>
    `;
    
    // Set initial header content
    speciesHeader.innerHTML = baseHeaderContent;
    speciesHeader.classList.remove('d-none');
    
    if (!isAppending) {
        speciesList.innerHTML = '';
    }

    // Fetch common names for the new batch
    console.log('Fetching common names for species...');
    const speciesWithCommonNames = await fetchCommonNamesForBatch(uniqueSpeciesArray, species[0]?.countryCode);
    
    // Sort and display species
    const sortedSpecies = speciesWithCommonNames.sort((a, b) => {
        const levels = ['kingdom', 'phylum', 'class', 'order', 'species'];
        for (const level of levels) {
            const aValue = (a[level] || '').toLowerCase();
            const bValue = (b[level] || '').toLowerCase();
            if (aValue !== bValue) {
                return aValue.localeCompare(bValue);
            }
        }
        return 0;
    });

    // If appending, clear all existing items to rebuild the list
    if (isAppending) {
        const existingItems = speciesList.querySelectorAll('.species-item, .taxonomy-group-header');
        existingItems.forEach(item => item.remove());
    }

    // Track current class
    let currentClass = '';

    // Display species
    sortedSpecies.forEach(species => {
        // Check if we need to add a class header
        if (species.class !== currentClass) {
            const groupHeader = document.createElement('div');
            groupHeader.className = 'taxonomy-group-header';
            groupHeader.setAttribute('data-class-header', species.class);
            groupHeader.innerHTML = `Class: ${species.class || '-'}`;
            speciesList.appendChild(groupHeader);
            currentClass = species.class;
        }

        const speciesItem = document.createElement('div');
        speciesItem.className = 'species-item';
        speciesItem.setAttribute('data-taxon-key', species.taxonKey);
        
        speciesItem.innerHTML = `
            <div class="species-item-content">
                <span class="species-name">${species.mostCommonName || species.vernacularName || species.scientificName}</span>
                <span class="species-taxonomy">
                    ${species.kingdom} > ${species.phylum} > ${species.class} > ${species.order} > ${species.species}
                </span>
            </div>
        `;
        
        speciesList.appendChild(speciesItem);
    });

    // Store the species data for download
    lastSpeciesData = sortedSpecies;
}

// Function to load more species
async function loadMoreSpecies() {
    if (isLoadingMore || !currentPolygonCoords) return;
    
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) {
        loadMoreBtn.disabled = true;
        loadMoreBtn.innerHTML = `
            <div style="display: inline-flex; align-items: center;">
                <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="width: 0.8rem; height: 0.8rem; border-width: 0.1rem; margin-right: 8px;"></span>
                Loading...
            </div>
        `;
    }
    
    isLoadingMore = true;
    let timeoutId;
    
    try {
        let newSpecies = [];
        let batchOffset = currentOffset;
        const batchSize = 1000;
        const maxRetries = 3;
        const maxTimePerBatch = 10000; // 10 seconds timeout per batch
        const existingSpeciesIds = new Set(
            Array.from(document.querySelectorAll('.species-item'))
                .map(el => el.getAttribute('data-taxon-key'))
        );

        // Keep fetching until we have at least 100 new unique species
        while (newSpecies.length < 100) {
            let retryCount = 0;
            let batchSuccess = false;

            while (retryCount < maxRetries && !batchSuccess) {
                try {
                    // Create a promise that rejects after timeout
                    const timeoutPromise = new Promise((_, reject) => {
                        timeoutId = setTimeout(() => {
                            reject(new Error('Request timed out'));
                        }, maxTimePerBatch);
                    });

                    // Race between the actual request and the timeout
                    const result = await Promise.race([
                        getSpeciesInPolygon(currentPolygonCoords, batchOffset + batchSize, batchSize),
                        timeoutPromise
                    ]);

                    // Clear timeout if request succeeded
                    clearTimeout(timeoutId);
                    
                    // If no more results, break both loops
                    if (!result.species || result.species.length === 0) {
                        batchSuccess = true;
                        break;
                    }

                    // Filter out species we've already seen
                    const uniqueNewSpecies = result.species.filter(species => 
                        !existingSpeciesIds.has(species.taxonKey?.toString())
                    );

                    newSpecies = newSpecies.concat(uniqueNewSpecies);
                    batchOffset += batchSize;
                    batchSuccess = true;

                    // Update button text to show progress
                    if (loadMoreBtn) {
                        loadMoreBtn.innerHTML = `
                            <div style="display: inline-flex; align-items: center;">
                                <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="width: 0.8rem; height: 0.8rem; border-width: 0.1rem; margin-right: 8px;"></span>
                                Loading... (${newSpecies.length} new species found)
                            </div>
                        `;
                    }

                    // If we've fetched all available occurrences, break both loops
                    if (batchOffset >= result.total) {
                        break;
                    }

                } catch (error) {
                    clearTimeout(timeoutId);
                    console.error(`Batch retry ${retryCount + 1} failed:`, error);
                    retryCount++;
                    
                    // If we've exhausted retries, increment offset anyway to avoid getting stuck
                    if (retryCount === maxRetries) {
                        console.log('Max retries reached, incrementing offset to avoid getting stuck');
                        batchOffset += batchSize;
                        toastr.warning('Some species may have been skipped due to a temporary error');
                    } else {
                        // Wait before retrying (exponential backoff)
                        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
                    }
                }
            }

            // If the inner loop failed all retries, break the outer loop
            if (!batchSuccess && retryCount === maxRetries) {
                break;
            }
        }

        // Update the current offset regardless of errors
        currentOffset = batchOffset;
        
        // Display the new species
        if (newSpecies.length > 0) {
            await displaySpecies(newSpecies, totalOccurrences, true);
            toastr.success(`Loaded ${newSpecies.length} new species`);
        } else {
            toastr.info('No more new species found in the selected area');
        }
    } catch (error) {
        console.error('Error in loadMoreSpecies:', error);
        toastr.error('Error loading more species. You can try again.');
        
        // Increment offset even on error to prevent getting stuck
        currentOffset += 1000;
    } finally {
        clearTimeout(timeoutId);
        isLoadingMore = false;
        if (loadMoreBtn) {
            loadMoreBtn.disabled = false;
            loadMoreBtn.innerHTML = 'Load More';
        }
    }
}

// Initialize modal
let loadGeofenceModal;

document.addEventListener('DOMContentLoaded', function() {
    // Initialize Bootstrap modal
    loadGeofenceModal = new bootstrap.Modal(document.getElementById('loadGeofenceModal'));
    displaySavedGeofences();
    // ... rest of existing DOMContentLoaded code ...
});

function showLoadGeofenceModal() {
    displaySavedGeofences(); // Refresh the list
    loadGeofenceModal.show();
}

// Function to display saved geofences
function displaySavedGeofences() {
    const savedPolygons = JSON.parse(localStorage.getItem('savedPolygons') || '[]');
    const geofenceList = document.getElementById('savedGeofencesList');
    
    if (!geofenceList) {
        console.error('Geofence list element not found');
        return;
    }

    geofenceList.innerHTML = '';
    
    if (savedPolygons.length === 0) {
        geofenceList.innerHTML = '<div class="text-muted p-3">No saved geofences</div>';
        return;
    }

    savedPolygons.forEach((polygon, index) => {
        const item = document.createElement('div');
        item.className = 'saved-geofence-item d-flex justify-content-between align-items-center';
        item.innerHTML = `
            <span>${polygon.name}</span>
            <div>
                <button class="btn btn-sm btn-primary me-2" onclick="loadGeofence(${index})">
                    <small>Load</small>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteGeofence(${index})">
                    <small>Delete</small>
                </button>
            </div>
        `;
        geofenceList.appendChild(item);
    });
}

// Function to delete a specific geofence
function deleteGeofence(index) {
    const savedPolygons = JSON.parse(localStorage.getItem('savedPolygons') || '[]');
    const deletedName = savedPolygons[index].name;
    
    savedPolygons.splice(index, 1);
    localStorage.setItem('savedPolygons', JSON.stringify(savedPolygons));
    
    displaySavedGeofences();
    toastr.success(`Deleted geofence: ${deletedName}`);
}

// Function to clear all saved geofences
function clearAllGeofences() {
    if (confirm('Are you sure you want to delete all saved geofences?')) {
        localStorage.removeItem('savedPolygons');
        displaySavedGeofences();
        toastr.success('All geofences cleared');
        loadGeofenceModal.hide();
    }
}

// Function to load a specific geofence
function loadGeofence(index) {
    const savedPolygons = JSON.parse(localStorage.getItem('savedPolygons') || '[]');
    const polygon = savedPolygons[index];
    
    if (!polygon) {
        toastr.error('Geofence not found');
        return;
    }

    // Clear existing polygon
    drawnItems.clearLayers();
    
    // Create new polygon from saved coordinates
    currentPolygon = L.polygon(polygon.coordinates);
    drawnItems.addLayer(currentPolygon);
    
    // Set the polygon name
    document.getElementById('polygonName').value = polygon.name;
    
    // Fit map to polygon bounds
    map.fitBounds(currentPolygon.getBounds());
    
    // Close the modal
    loadGeofenceModal.hide();
    
    toastr.success(`Loaded geofence: ${polygon.name}`);
}

// Update the searchSpecies function
async function searchSpecies() {
    if (!currentPolygon) {
        toastr.error('Please draw a polygon first');
        return;
    }

    showLoading();
    const loadingMsg = document.querySelector('.loading-message');
    if (loadingMsg) {
        loadingMsg.textContent = 'Initializing species search...';
    }
    try {
        // Get coordinates from the polygon
        const coords = currentPolygon.getLatLngs()[0].map(latLng => [latLng.lat, latLng.lng]);
        
        // Ensure the polygon is closed
        if (coords[0][0] !== coords[coords.length - 1][0] || 
            coords[0][1] !== coords[coords.length - 1][1]) {
            coords.push(coords[0]);
        }

        // Reset pagination variables
        currentOffset = 0;
        currentPolygonCoords = coords;
        
        let allSpecies = [];
        let batchOffset = 0;
        const batchSize = 1000;
        let timeoutId;
        const maxRetries = 3;
        const maxTimePerBatch = 30000; // 30 seconds timeout per batch

        // Keep fetching until we have at least 100 species
        while (allSpecies.length < 100) {
            let retryCount = 0;
            let batchSuccess = false;

            while (retryCount < maxRetries && !batchSuccess) {
                try {
                    // Create a promise that rejects after timeout
                    const timeoutPromise = new Promise((_, reject) => {
                        timeoutId = setTimeout(() => {
                            reject(new Error('Request timed out'));
                        }, maxTimePerBatch);
                    });

                    // Race between the actual request and the timeout
                    const result = await Promise.race([
                        getSpeciesInPolygon(coords, batchOffset, batchSize),
                        timeoutPromise
                    ]);

                    // Clear timeout if request succeeded
                    clearTimeout(timeoutId);

                    // Update loading message
                    if (loadingMsg) {
                        loadingMsg.textContent = `Searching for species... (${allSpecies.length} found so far)`;
                    }

                    if (!result.species || result.species.length === 0) {
                        batchSuccess = true;
                        break;
                    }

                    totalOccurrences = result.total;
                    
                    // Add new unique species
                    const uniqueNewSpecies = result.species.filter(species => 
                        !allSpecies.some(s => s.taxonKey === species.taxonKey)
                    );
                    allSpecies = allSpecies.concat(uniqueNewSpecies);
                    batchOffset += batchSize;
                    batchSuccess = true;

                    // If we've fetched all available occurrences, break both loops
                    if (batchOffset >= result.total) {
                        break;
                    }

                } catch (error) {
                    clearTimeout(timeoutId);
                    console.error(`Batch retry ${retryCount + 1} failed:`, error);
                    retryCount++;
                    
                    if (retryCount === maxRetries) {
                        console.log('Max retries reached, incrementing offset to avoid getting stuck');
                        batchOffset += batchSize;
                        toastr.warning('Some species may have been skipped due to a temporary error');
                        break;
                    } else {
                        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
                    }
                }
            }

            // Break if we can't get more results
            if (!batchSuccess && retryCount === maxRetries) {
                break;
            }
        }

        // Update current offset for "Load More" functionality
        currentOffset = batchOffset;
        
        // Display all species found
        await displaySpecies(allSpecies, totalOccurrences);
        
        if (allSpecies.length > 0) {
            toastr.success(`Found ${allSpecies.length} species`);
        } else {
            toastr.warning('No species found in the selected area');
        }
    } catch (error) {
        console.error('Error:', error);
        toastr.error('Error searching for species');
    } finally {
        hideLoading();
    }
}

// Function to save the current geofence
function saveGeofence() {
    if (!currentPolygon) {
        toastr.error('Please draw a polygon first');
        return;
    }

    const polygonName = document.getElementById('polygonName').value;
    if (!polygonName) {
        toastr.error('Please enter a name for the polygon');
        return;
    }

    try {
        // Get coordinates from the polygon
        const coords = currentPolygon.getLatLngs()[0].map(latLng => [latLng.lat, latLng.lng]);
        
        // Ensure the polygon is closed
        if (coords[0][0] !== coords[coords.length - 1][0] || 
            coords[0][1] !== coords[coords.length - 1][1]) {
            coords.push(coords[0]);
        }

        // Save polygon to localStorage
        const polygonData = {
            name: polygonName,
            coordinates: coords
        };
        
        const savedPolygons = JSON.parse(localStorage.getItem('savedPolygons') || '[]');
        
        // Check if a polygon with this name already exists
        const existingIndex = savedPolygons.findIndex(p => p.name === polygonName);
        if (existingIndex >= 0) {
            if (confirm(`A geofence named "${polygonName}" already exists. Do you want to update it?`)) {
                savedPolygons[existingIndex] = polygonData;
                toastr.success('Geofence updated successfully');
            } else {
                return;
            }
        } else {
            savedPolygons.push(polygonData);
            toastr.success('Geofence saved successfully');
        }
        
        localStorage.setItem('savedPolygons', JSON.stringify(savedPolygons));
        displaySavedGeofences();
        
    } catch (error) {
        console.error('Error:', error);
        toastr.error('Error saving geofence');
    }
}

// Function to download species list as CSV
function downloadSpeciesList() {
    if (!lastSpeciesData || lastSpeciesData.length === 0) {
        toastr.error('No species data available');
        return;
    }

    // Create a Map to store unique species by taxonomic hierarchy
    const uniqueSpecies = new Map();
    lastSpeciesData.forEach(s => {
        // Create a key based on full taxonomic hierarchy including species
        const taxonomyKey = `${s.kingdom || 'Animalia'}-${s.phylum || '-'}-${s.class || '-'}-${s.order || '-'}-${s.species || '-'}`;
        if (!uniqueSpecies.has(taxonomyKey)) {
            uniqueSpecies.set(taxonomyKey, s);
        }
    });

    // Convert unique species back to array and sort by taxonomy
    const sortedSpecies = Array.from(uniqueSpecies.values()).sort((a, b) => {
        // Sort by complete taxonomy hierarchy
        const aKey = `${a.kingdom || ''}-${a.phylum || ''}-${a.class || ''}-${a.order || ''}-${a.species || ''}`;
        const bKey = `${b.kingdom || ''}-${b.phylum || ''}-${b.class || ''}-${b.order || ''}-${b.species || ''}`;
        return aKey.localeCompare(bKey);
    });

    const csvContent = [
        ['Kingdom', 'Phylum', 'Class', 'Order', 'Species', 'Most Common Name'],
        ...sortedSpecies.map(species => [
            species.kingdom || 'Animalia',
            species.phylum || '-',
            species.class || '-',
            species.order || '-',
            species.species || '-',
            species.mostCommonName || '-'
        ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'unique_species_list.csv';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
} 