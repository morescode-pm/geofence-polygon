from flask import Flask, render_template, request, jsonify
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut
import json
from polygon_visualizer import create_polygon_from_wkt_coords, visualize_and_save_polygon

app = Flask(__name__)

def get_location_coords(location_name):
    try:
        geolocator = Nominatim(user_agent="my_polygon_app")
        location = geolocator.geocode(location_name)
        if location:
            return [location.latitude, location.longitude]
        return None
    except GeocoderTimedOut:
        return None

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
    data = request.get_json()
    polygon_coords = data.get('coordinates')
    
    # Convert coordinates to WKT format
    coords_str = ','.join([f'{coord[1]} {coord[0]}' for coord in polygon_coords])
    wkt_polygon = f'POLYGON(({coords_str}))'
    
    try:
        # Create and save the polygon visualization
        polygon_gdf = create_polygon_from_wkt_coords(wkt_polygon)
        visualize_and_save_polygon(polygon_gdf, "user_drawn_polygon")
        
        return jsonify({
            'success': True,
            'message': 'Polygon saved successfully',
            'files': {
                'geojson': 'user_drawn_polygon.geojson',
                'image': 'user_drawn_polygon_map.png'
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        })

if __name__ == '__main__':
    app.run(debug=True) 