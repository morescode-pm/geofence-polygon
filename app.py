from flask import Flask, render_template, request, jsonify, send_file
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut
import json
from polygon_visualizer import create_polygon_from_wkt_coords, visualize_and_save_polygon
import os
import re
from werkzeug.serving import is_running_from_reloader
import matplotlib.pyplot as plt
import requests
import pandas as pd
from io import StringIO
import time
import io

app = Flask(__name__)

# Create a single geolocator instance
geolocator = Nominatim(user_agent="my_polygon_app")

# Store the last fetched species data
last_species_data = None

def get_location_coords(location_name):
    try:
        location = geolocator.geocode(location_name)
        if location:
            return [location.latitude, location.longitude]
        return None
    except GeocoderTimedOut:
        return None

def sanitize_filename(filename):
    """Convert a string into a safe filename."""
    # Remove invalid characters and replace spaces with underscores
    filename = re.sub(r'[<>:"/\\|?*]', '', filename)
    filename = filename.replace(' ', '_')
    return filename.lower()

def get_common_name(taxon_id):
    """Fetch common name from GBIF Species API."""
    try:
        response = requests.get(f'https://api.gbif.org/v1/species/{taxon_id}')
        if response.status_code == 200:
            data = response.json()
            if data.get('vernacularNames'):
                # Try to find an English common name first
                english_names = [n['vernacularName'] for n in data['vernacularNames'] 
                               if n.get('language', '').lower() == 'eng']
                if english_names:
                    return english_names[0]
                # If no English name, return the first vernacular name
                return data['vernacularNames'][0]['vernacularName']
    except Exception as e:
        print(f"Error fetching common name for taxon {taxon_id}: {str(e)}")
    return None

def ensure_species_lists_directory():
    """Create the species lists directory if it doesn't exist."""
    save_dir = os.path.join(os.getcwd(), 'species_lists')
    if not os.path.exists(save_dir):
        os.makedirs(save_dir)
    return save_dir

def get_species_in_polygon(polygon_coords):
    """Fetch species data from GBIF API within the given polygon."""
    # Format polygon coordinates for GBIF
    polygon_str = 'POLYGON(('
    polygon_str += ','.join([f'{coord[1]} {coord[0]}' for coord in polygon_coords])
    polygon_str += '))'

    # GBIF API parameters
    params = {
        'geometry': polygon_str,
        'limit': 300,
        'kingdomKey': '1',  # Animalia
        'hasCoordinate': 'true',
        'status': 'ACCEPTED'
    }

    species_data = []
    offset = 0
    total_records = None
    processed_taxa = set()

    while total_records is None or offset < min(total_records, 1000):
        try:
            response = requests.get(
                'https://api.gbif.org/v1/occurrence/search',
                params={**params, 'offset': offset}
            )
            
            if response.status_code == 200:
                data = response.json()
                if total_records is None:
                    total_records = data['count']
                
                # Process results
                for result in data['results']:
                    taxon_id = result.get('taxonKey')
                    if (taxon_id and 
                        result.get('kingdom') == 'Animalia' and  # Double-check kingdom
                        taxon_id not in processed_taxa):
                        
                        species_info = {
                            'kingdom': result.get('kingdom', '-'),
                            'phylum': result.get('phylum', '-'),
                            'class': result.get('class', '-'),
                            'order': result.get('order', '-'),
                            'species': result.get('species', '-'),
                            'taxonId': taxon_id
                        }
                        
                        species_data.append(species_info)
                        processed_taxa.add(taxon_id)
            
            offset += 300
            time.sleep(0.1)  # Be nice to the API
            
        except Exception as e:
            print(f"Error fetching GBIF data: {str(e)}")
            break

    return species_data

def sort_species_data(species_data):
    """Sort species data by taxonomic hierarchy."""
    return sorted(species_data, key=lambda x: (
        x.get('kingdom', ''),
        x.get('phylum', ''),
        x.get('class', ''),
        x.get('order', ''),
        x.get('species', '')
    ))

@app.route('/')
def index():
    # Instead of using folium, we'll use the map.html template directly
    return render_template('index.html')

@app.route('/search', methods=['POST'])
def search_location():
    data = request.get_json()
    location_name = data.get('location')
    coords = get_location_coords(location_name)
    
    if coords:
        return jsonify({
            'success': True,
            'coords': coords
        })
    return jsonify({
        'success': False,
        'message': 'Location not found'
    })

@app.route('/save_polygon', methods=['POST'])
def save_polygon():
    try:
        data = request.get_json()
        polygon_coords = data.get('coordinates')
        polygon_name = data.get('name', 'unnamed_polygon')
        
        # Sanitize the filename
        safe_name = sanitize_filename(polygon_name)
        
        # Ensure the polygon is closed
        if polygon_coords[0] != polygon_coords[-1]:
            polygon_coords.append(polygon_coords[0])
        
        # Convert coordinates to WKT format
        coords_str = ','.join([f'{coord[1]} {coord[0]}' for coord in polygon_coords])
        wkt_polygon = f'POLYGON(({coords_str}))'
        
        # Create and save the polygon visualization
        polygon_gdf = create_polygon_from_wkt_coords(wkt_polygon)
        save_result = visualize_and_save_polygon(polygon_gdf, safe_name)
        
        # Fetch species data
        global last_species_data
        last_species_data = get_species_in_polygon(polygon_coords)
        
        # Sort the species data
        sorted_species = sort_species_data(last_species_data)
        
        # Save species list to CSV
        if sorted_species:
            species_dir = ensure_species_lists_directory()
            csv_path = os.path.join(species_dir, f"{safe_name}_species_list.csv")
            
            # Create DataFrame from sorted data
            df = pd.DataFrame(sorted_species)
            df.to_csv(csv_path, index=False, encoding='utf-8')
        
        return jsonify({
            'success': True,
            'message': 'Polygon saved successfully',
            'files': {
                'geojson': os.path.basename(save_result['geojson_path']),
                'image': os.path.basename(save_result['png_path'])
            },
            'species': sorted_species
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        })

@app.route('/download_species_csv')
def download_species_csv():
    """Generate and send a CSV file of the species list."""
    if not last_species_data:
        return jsonify({'error': 'No species data available'}), 404
    
    # Sort the species data
    sorted_species = sort_species_data(last_species_data)
    
    # Create DataFrame from sorted data
    df = pd.DataFrame(sorted_species)
    
    # Create CSV in memory
    output = io.BytesIO()
    df.to_csv(output, index=False, encoding='utf-8')
    output.seek(0)
    
    return send_file(
        output,
        mimetype='text/csv',
        as_attachment=True,
        download_name='species_list.csv'
    )

@app.route('/saved_polygons/<path:filename>')
def get_saved_polygon(filename):
    """Serve saved polygon files."""
    save_dir = os.path.join(os.getcwd(), 'saved_polygons')
    try:
        return send_file(
            os.path.join(save_dir, filename),
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 404

def cleanup():
    """Clean up resources when the server shuts down."""
    plt.close('all')

if __name__ == '__main__':
    # Register cleanup function
    import atexit
    atexit.register(cleanup)
    
    # Only run in non-debug mode or if we're the main process
    if not is_running_from_reloader() or os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        app.run(debug=True, threaded=True)
    else:
        app.run(debug=True) 