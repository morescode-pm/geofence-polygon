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

            for (const result of data.results) {
                const taxonId = result.taxonKey;
                if (taxonId && 
                    result.kingdom === 'Animalia' && 
                    !processedTaxa.has(taxonId)) {
                    
                    speciesData.push({
                        kingdom: result.kingdom || '-',
                        phylum: result.phylum || '-',
                        class: result.class || '-',
                        order: result.order || '-',
                        species: result.species || '-',
                        taxonId: taxonId
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

    return speciesData;
}

// Function to sort species data
function sortSpeciesData(speciesData) {
    return speciesData.sort((a, b) => {
        const fields = ['kingdom', 'phylum', 'class', 'order', 'species'];
        for (const field of fields) {
            if (a[field] !== b[field]) {
                return a[field].localeCompare(b[field]);
            }
        }
        return 0;
    });
}

// Function to display species list
function displaySpeciesList(speciesData) {
    const speciesList = document.getElementById('speciesList');
    speciesList.innerHTML = '';

    speciesData.forEach(species => {
        const div = document.createElement('div');
        div.className = 'species-item';
        div.innerHTML = `
            <strong>${species.species}</strong><br>
            <small>
                ${species.kingdom} > ${species.phylum} > ${species.class} > ${species.order}
            </small>
        `;
        speciesList.appendChild(div);
    });
}

// Function to save geofence and search for species
async function saveGeofenceAndSearch() {
    if (!currentPolygon) {
        toastr.error('Please draw a polygon first');
        return;
    }

    const polygonName = document.getElementById('polygonName').value;
    if (!polygonName) {
        toastr.error('Please enter a name for the polygon');
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

        // Save polygon to localStorage
        const polygonData = {
            name: polygonName,
            coordinates: coords
        };
        
        const savedPolygons = JSON.parse(localStorage.getItem('savedPolygons') || '[]');
        savedPolygons.push(polygonData);
        localStorage.setItem('savedPolygons', JSON.stringify(savedPolygons));

        // Get species data
        lastSpeciesData = await getSpeciesInPolygon(coords);
        const sortedSpecies = sortSpeciesData(lastSpeciesData);
        
        // Display species list
        displaySpeciesList(sortedSpecies);
        
        toastr.success('Polygon saved and species search completed');
    } catch (error) {
        console.error('Error:', error);
        toastr.error('Error saving polygon and searching species');
    } finally {
        hideLoading();
    }
}

// Function to load saved geofence
function loadGeofence() {
    const savedPolygons = JSON.parse(localStorage.getItem('savedPolygons') || '[]');
    
    if (savedPolygons.length === 0) {
        toastr.error('No saved polygons found');
        return;
    }

    // Create a modal to display saved polygons
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Load Saved Polygon</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="list-group">
                        ${savedPolygons.map((polygon, index) => `
                            <button type="button" class="list-group-item list-group-item-action" 
                                    onclick="loadPolygon(${index})" data-bs-dismiss="modal">
                                ${polygon.name}
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();
    
    modal.addEventListener('hidden.bs.modal', function () {
        document.body.removeChild(modal);
    });
}

// Function to load a specific polygon
function loadPolygon(index) {
    const savedPolygons = JSON.parse(localStorage.getItem('savedPolygons') || '[]');
    const polygon = savedPolygons[index];
    
    if (!polygon) {
        toastr.error('Polygon not found');
        return;
    }

    // Clear existing polygon
    drawnItems.clearLayers();
    
    // Create new polygon
    currentPolygon = L.polygon(polygon.coordinates);
    drawnItems.addLayer(currentPolygon);
    
    // Fit map to polygon bounds
    map.fitBounds(currentPolygon.getBounds());
    
    document.getElementById('polygonName').value = polygon.name;
    toastr.success('Polygon loaded successfully');
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