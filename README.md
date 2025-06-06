# Species Geofencing Tool

A web-based tool that allows users to draw geofences on a map and discover species that have been observed within that area. The tool uses the GBIF (Global Biodiversity Information Facility) API to fetch species data.

## Features

- Draw custom geofences on an interactive map
- Search for locations to quickly navigate the map
- Save geofences as GeoJSON files with visualizations
- Get a list of animal species observed within the geofence
- Export species lists as CSV files
- Load previously saved geofences
- Hierarchical sorting of species by taxonomic classification

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

## Contributing

Feel free to submit issues, fork the repository, and create pull requests for any improvements.

