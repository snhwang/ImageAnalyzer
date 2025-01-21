import numpy as np
import cv2

def calculate_distance(point1, point2, pixel_spacing=1.0):
    """Calculate distance between two points"""
    return np.sqrt(((point1[0] - point2[0]) * pixel_spacing) ** 2 + 
                  ((point1[1] - point2[1]) * pixel_spacing) ** 2)

def calculate_area(points, pixel_spacing=1.0):
    """Calculate area of a polygon defined by points"""
    if len(points) < 3:
        return 0
    points = np.array(points)
    area = cv2.contourArea(points) * (pixel_spacing ** 2)
    return area

def draw_measurement(image, points, measurement_type="distance"):
    """Draw measurement overlay on image"""
    img_copy = image.copy()
    
    if measurement_type == "distance" and len(points) == 2:
        cv2.line(img_copy, tuple(points[0]), tuple(points[1]), (255, 0, 0), 2)
        distance = calculate_distance(points[0], points[1])
        mid_point = ((points[0][0] + points[1][0]) // 2, 
                    (points[0][1] + points[1][1]) // 2)
        cv2.putText(img_copy, f"{distance:.1f}px", mid_point,
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 0, 0), 2)
    
    elif measurement_type == "area" and len(points) > 2:
        pts = np.array(points, np.int32)
        cv2.polylines(img_copy, [pts], True, (0, 255, 0), 2)
        area = calculate_area(points)
        centroid = np.mean(points, axis=0, dtype=np.int32)
        cv2.putText(img_copy, f"{area:.1f}px²", tuple(centroid),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    
    return img_copy
