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

// Function to get species in polygon from GBIF
async function getSpeciesInPolygon(polygonCoords) {
    // Format polygon coordinates for GBIF
    const polygonStr = 'POLYGON((' + 
        polygonCoords.map(coord => `${coord[1]} ${coord[0]}`).join(',') +
        '))';

    const params = new URLSearchParams({
        geometry: polygonStr,
        limit: 300,
        kingdomKey: '1', // Animalia
        hasCoordinate: 'true',
        status: 'ACCEPTED'
    });

    const speciesData = [];
    const processedTaxa = new Set();
    let offset = 0;
    const maxRecords = 1000;

    while (offset < maxRecords) {
        try {
            const response = await fetch(`https://api.gbif.org/v1/occurrence/search?${params}&offset=${offset}`);
            const data = await response.json();

            if (!data.results || data.results.length === 0) break;

            console.log(`Fetched ${data.results.length} results from GBIF`);

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
                        species: result.species || result.scientificName || '-'
                    });
                    processedTaxa.add(taxonId);
                }
            }

            offset += 300;
            await new Promise(resolve => setTimeout(resolve, 100)); // Be nice to the API
        } catch (error) {
            console.error('Error fetching GBIF data:', error);
            break;
        }
    }

    console.log(`Total species data before deduplication: ${speciesData.length}`);
    return speciesData;
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

function displaySpecies(species) {
    console.log('Displaying species data:', species);
    const speciesList = document.getElementById('speciesList');
    const speciesHeader = document.querySelector('.species-list-header');
    
    if (!species || species.length === 0) {
        console.log('No species data to display');
        speciesHeader.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <span>0 Species found within Geofence:</span>
                <button class="btn btn-sm btn-info" onclick="downloadSpeciesList()">Download Species List</button>
            </div>
        `;
        speciesHeader.classList.remove('d-none');
        speciesList.innerHTML = '<div class="species-item">No species found in this area.</div>';
        return;
    }

    // Create a Map to store unique species by taxonKey instead of scientific name
    const uniqueSpecies = new Map();
    
    species.forEach(s => {
        // Use taxonKey as the unique identifier
        if (!uniqueSpecies.has(s.taxonKey)) {
            uniqueSpecies.set(s.taxonKey, s);
        }
    });

    // Convert unique species back to array
    const uniqueSpeciesArray = Array.from(uniqueSpecies.values());
    console.log(`Unique species after deduplication: ${uniqueSpeciesArray.length}`);
    
    // Update header with count
    speciesHeader.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
            <span>${uniqueSpeciesArray.length} Species found within Geofence:</span>
            <button class="btn btn-sm btn-info" onclick="downloadSpeciesList()">Download Species List</button>
        </div>
    `;
    speciesHeader.classList.remove('d-none');
    
    // Clear existing list
    speciesList.innerHTML = '';
    
    // Display unique species
    uniqueSpeciesArray.forEach(species => {
        const speciesItem = document.createElement('div');
        speciesItem.className = 'species-item';
        
        const commonName = species.vernacularName || 'No common name available';
        const scientificName = species.scientificName || 'Unknown species';
        const taxonId = species.taxonKey || 'N/A';
        
        speciesItem.innerHTML = `
            <div class="species-item-content">
                <span class="species-name">${commonName === scientificName ? `<em>${scientificName}</em>` : `${commonName} (<em>${scientificName}</em>)`}</span>
                <span class="species-taxonomy">
                    ${species.kingdom} > ${species.phylum} > ${species.class} > ${species.order}
                    <small class="text-muted ms-2">ID: ${taxonId}</small>
                </span>
            </div>
        `;
        
        speciesList.appendChild(speciesItem);
    });
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

// Function to search for species in the current polygon
async function searchSpecies() {
    if (!currentPolygon) {
        toastr.error('Please draw a polygon first');
        return;
    }

    showLoading();
    try {
        // Get coordinates from the polygon
        const coords = currentPolygon.getLatLngs()[0].map(latLng => [latLng.lat, latLng.lng]);
        
        // Ensure the polygon is closed
        if (coords[0][0] !== coords[coords.length - 1][0] || 
            coords[0][1] !== coords[coords.length - 1][1]) {
            coords.push(coords[0]);
        }

        // Get species data
        console.log('Fetching species data for polygon...');
        lastSpeciesData = await getSpeciesInPolygon(coords);
        console.log('Species data fetched:', lastSpeciesData);
        const sortedSpecies = sortSpeciesData(lastSpeciesData);
        
        // Display species list
        displaySpecies(sortedSpecies);
        
        toastr.success('Species search completed');
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

    const sortedSpecies = sortSpeciesData(lastSpeciesData);
    const csvContent = [
        ['Kingdom', 'Phylum', 'Class', 'Order', 'Species', 'TaxonID'],
        ...sortedSpecies.map(species => [
            species.kingdom,
            species.phylum,
            species.class,
            species.order,
            species.species,
            species.taxonId
        ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'species_list.csv';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
} 