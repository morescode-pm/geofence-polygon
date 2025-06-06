from flask import Flask, render_template, request, jsonify
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut
import json
from polygon_visualizer import create_polygon_from_wkt_coords, visualize_and_save_polygon
import os
import re
from werkzeug.serving import is_running_from_reloader
import matplotlib.pyplot as plt

app = Flask(__name__)

# Create a single geolocator instance
geolocator = Nominatim(user_agent="my_polygon_app")

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
        
        return jsonify({
            'success': True,
            'message': 'Polygon saved successfully',
            'files': {
                'geojson': os.path.basename(save_result['geojson_path']),
                'image': os.path.basename(save_result['png_path'])
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        })

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