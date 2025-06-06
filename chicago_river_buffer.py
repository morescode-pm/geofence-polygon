import osmnx as ox
import geopandas as gpd
from shapely.ops import unary_union
import matplotlib.pyplot as plt

def create_chicago_river_buffer(buffer_miles=10):
    # Configure osmnx
    ox.settings.log_console = True
    
    # Define the query to get Chicago River using the correct format
    tags = {'waterway': 'river', 'name': 'Chicago River'}
    
    # Download Chicago River data
    print("Downloading Chicago River data...")
    chicago_area = ox.geocode_to_gdf("Chicago, Illinois, USA")
    river = ox.features_from_place("Chicago, Illinois, USA", tags)
    
    # Convert buffer from miles to meters (1 mile ≈ 1609.34 meters)
    buffer_meters = buffer_miles * 1609.34
    
    # Create a buffer around the river
    print(f"Creating {buffer_miles}-mile buffer around the river...")
    river_union = unary_union(river.geometry)
    river_buffer = river_union.buffer(buffer_meters)
    
    # Create a GeoDataFrame with the buffer
    buffer_gdf = gpd.GeoDataFrame(geometry=[river_buffer], crs=river.crs)
    
    # Save to GeoJSON
    output_file = "chicago_river_buffer.geojson"
    buffer_gdf.to_file(output_file, driver="GeoJSON")
    print(f"Buffer saved to {output_file}")
    
    # Create a visualization
    fig, ax = plt.subplots(figsize=(15, 15))
    chicago_area.plot(ax=ax, color='lightgrey')
    river.plot(ax=ax, color='blue', label='Chicago River')
    buffer_gdf.plot(ax=ax, alpha=0.3, color='red', label='10-mile buffer')
    plt.title('Chicago River with Buffer Zone')
    plt.legend()
    plt.savefig('chicago_river_map.png')
    print("Map visualization saved as chicago_river_map.png")

if __name__ == "__main__":
    create_chicago_river_buffer(10) 