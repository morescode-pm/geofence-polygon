import geopandas as gpd
from shapely import wkt
import matplotlib.pyplot as plt
import os
import numpy as np

def ensure_save_directory():
    """Create the save directory if it doesn't exist."""
    save_dir = os.path.join(os.getcwd(), 'saved_polygons')
    if not os.path.exists(save_dir):
        os.makedirs(save_dir)
    return save_dir

def create_polygon_from_wkt_coords(wkt_polygon):
    """Create a GeoDataFrame from WKT polygon coordinates."""
    # Create polygon from WKT string
    polygon = wkt.loads(wkt_polygon)
    
    # Create GeoDataFrame
    gdf = gpd.GeoDataFrame(geometry=[polygon], crs="EPSG:4326")
    return gdf

def visualize_and_save_polygon(gdf, output_name):
    """Visualize and save the polygon as both GeoJSON and PNG map."""
    # Ensure save directory exists
    save_dir = ensure_save_directory()
    
    # Create full file paths
    geojson_path = os.path.join(save_dir, f"{output_name}.geojson")
    png_path = os.path.join(save_dir, f"{output_name}_map.png")
    
    # Save as GeoJSON
    gdf.to_file(geojson_path, driver='GeoJSON')
    
    # Create visualization
    fig, ax = plt.subplots(figsize=(10, 10))
    
    # Plot the polygon
    gdf.plot(ax=ax, alpha=0.5, edgecolor='black')
    
    # Add basemap
    import contextily as ctx
    
    # Convert to Web Mercator
    gdf_web = gdf.to_crs(epsg=3857)
    
    # Clear the current plot and create a new one with the reprojected data
    ax.clear()
    gdf_web.plot(ax=ax, alpha=0.5, edgecolor='black')
    
    # Add the basemap
    ctx.add_basemap(
        ax,
        source=ctx.providers.OpenStreetMap.Mapnik,
        attribution=False  # Remove attribution text for a cleaner look
    )
    
    # Add title and labels
    plt.title('Polygon Visualization')
    ax.set_xlabel('Longitude')
    ax.set_ylabel('Latitude')
    
    plt.savefig(png_path, bbox_inches='tight', dpi=300)
    plt.close()
    
    return {
        'geojson_path': geojson_path,
        'png_path': png_path
    }

if __name__ == "__main__":
    # Example WKT polygon string (you can replace this with any other polygon string)
    wkt_polygon = "POLYGON((-5.86042 54.62056,-5.86145 54.62094,-5.8539 54.62818,-5.85532 54.63377,-5.87451 54.63855,-5.9164 54.60624,-5.91949 54.60268,-5.92005 54.59909,-5.904 54.59252,-5.89708 54.58303,-5.89286 54.58184,-5.89586 54.57933,-5.90233 54.57762,-5.9053 54.5725,-5.89495 54.57311,-5.89382 54.57092,-5.88892 54.57061,-5.87471 54.57728,-5.87141 54.57308,-5.87495 54.56892,-5.87465 54.56588,-5.8669 54.56754,-5.85436 54.56122,-5.84826 54.56255,-5.84646 54.56524,-5.8423 54.56566,-5.8394 54.5619,-5.83118 54.56173,-5.81932 54.55664,-5.8062 54.55665,-5.80527 54.55317,-5.79783 54.55515,-5.79873 54.56062,-5.79642 54.56385,-5.78744 54.56683,-5.78716 54.56807,-5.79022 54.56903,-5.78946 54.57015,-5.77944 54.57536,-5.78002 54.57649,-5.77217 54.57684,-5.77016 54.57554,-5.76616 54.57722,-5.76459 54.58037,-5.75717 54.58169,-5.75757 54.58487,-5.76415 54.58701,-5.76579 54.5917,-5.76817 54.59183,-5.76905 54.5939,-5.77298 54.59409,-5.77197 54.59947,-5.76914 54.60099,-5.76766 54.604,-5.77112 54.61357,-5.78053 54.61311,-5.78598 54.61938,-5.83052 54.61068,-5.82864 54.61682,-5.83736 54.61638,-5.83887 54.61797,-5.84875 54.61934,-5.85068 54.62123,-5.86042 54.62056))"
    
    # Create and visualize the polygon
    polygon_gdf = create_polygon_from_wkt_coords(wkt_polygon)
    visualize_and_save_polygon(polygon_gdf, "custom_polygon") 