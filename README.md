# Species Geofencing Tool

A web-based tool for drawing geofences and discovering species within the defined areas. This tool uses the GBIF (Global Biodiversity Information Facility) API to fetch species data within user-defined polygons.

## Features

- Draw polygons on an interactive map
- Search for locations by name
- Save and load geofences using browser storage
- Search for species within defined geofences
- Download species lists as CSV files
- Hierarchical sorting of species (Kingdom → Phylum → Class → Order → Species)
- Modern, responsive user interface

## Live Demo

This application is hosted on GitHub Pages at: https://morescode-pm.github.io/geofence-polygon/

## Technologies Used

- HTML5, CSS3, and JavaScript
- Leaflet.js for interactive maps
- Bootstrap 5 for UI components
- GBIF API for species data
- OpenStreetMap for base map tiles
- Browser LocalStorage for data persistence

## Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/morescode-pm/geofence-polygon.git
   cd geofence-polygon
   ```

2. Open the project in a web server:
   - You can use any local web server, for example:
     ```bash
     python -m http.server
     ```
   - Or use the Live Server extension in Visual Studio Code

3. Open your browser and navigate to `http://localhost:8000` (or the appropriate port)

## API Usage

This application uses the following external APIs:

1. GBIF API
   - Used for fetching species occurrence data
   - Documentation: https://www.gbif.org/developer/summary

2. Nominatim API
   - Used for geocoding (converting location names to coordinates)
   - Documentation: https://nominatim.org/release-docs/latest/api/Overview/

Note: The application respects API rate limits and includes appropriate delays between requests.

## Browser Support

The application is compatible with modern browsers that support:
- ES6+ JavaScript
- LocalStorage API
- Fetch API
- CSS Grid and Flexbox

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- GBIF for providing biodiversity data
- OpenStreetMap contributors for map data
- Leaflet.js team for the mapping library
- Bootstrap team for the UI framework

## Prerequisites

- Python 3.10 or higher
- Conda (recommended for environment management)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/geofence-polygon.git
cd geofence-polygon
```

2. Create and activate a conda environment:
```bash
conda create -n geofence python=3.10
conda activate geofence
```

3. Install the required packages:
```bash
pip install -r requirements.txt
```

## Usage

1. Start the application:
```bash
python app.py
```

2. Open your web browser and navigate to `http://localhost:5000`

3. Using the tool:

   a. **Drawing a Geofence**:
   - Use the polygon tool in the top-left corner of the map to start drawing
   - Click on the map to place points
   - Double-click to complete the polygon
   - Use the edit tools to modify the shape if needed
   
   b. **Searching for a Location**:
   - Enter a location name in the search box (e.g., "Chicago River, Chicago, IL")
   - Click "Search" to center the map on that location

   c. **Saving and Searching for Species**:
   - Enter a name for your geofence
   - Click "Save Geofence and Search" to:
     - Save the geofence as a GeoJSON file
     - Generate a visualization
     - Fetch species data for the area
   
   d. **Viewing Results**:
   - Species are displayed in the right panel
   - Data is organized hierarchically: Kingdom → Phylum → Class → Order → Species
   - Each species entry includes its GBIF Taxon ID
   
   e. **Exporting Data**:
   - Click "Download Species List as CSV" to export the current species list
   
   f. **Loading Previous Geofences**:
   - Click "Load Geofence" to import a previously saved geofence file
   - The original name will be restored for further searches

## File Organization

- `saved_polygons/`: Contains saved geofence files
  - `[name].geojson`: The geofence boundary
  - `[name]_map.png`: Visualization of the geofence
- `species_lists/`: Contains CSV files of species data
  - `[name]_species_list.csv`: Species found within each geofence

## Notes

- The tool focuses on animal species (Kingdom: Animalia)
- Species data is fetched from GBIF's occurrence database
- The map uses CartoDB's Positron basemap for a clean, minimal style
- All coordinates are stored in WGS84 (EPSG:4326) format

## Limitations

- Maximum of 1000 species records per geofence
- Requires an active internet connection for:
  - Map tiles
  - Location search
  - Species data retrieval
- Large geofences may take longer to process

