from PIL import Image
import matplotlib.pyplot as plt
import math
import random
import copy

def is_position_in_blue_silhouette(image_path, position):
    # Open the image and convert it to RGBA mode (if not already)
    img = Image.open(image_path).convert("RGBA")
    # Get the pixel data
    pixels = img.load()

    # Get the x and y coordinates from the input position
    x, y = position
    y = img.height - y

    # Check if the x, y coordinates are within the bounds of the image
    if x < 0 or y < 0 or x >= img.width or y >= img.height:
        return False

    # Get the pixel color at (x, y)
    pixel = pixels[x, y]

    # blue cus the track is blue in pic
    r, g, b, a = pixel

    if r < 90 and g > 130 and b > 120:  # Modify threshold values as needed
        return True
    return False


# Example usage
image_path = "/Users/mac/Downloads/image_18_2_optimized.png"
img = Image.open(image_path)

fig, ax = plt.subplots()
ax.imshow(img)

def plot_position(position):
    ax.scatter(position[0], img.height - position[1], color='red', s=20)
    plt.pause(0.01)

position = [1000, 60]
result = is_position_in_blue_silhouette(image_path, position)
print(f"position {position} is inside the silhouette: {result}")



velocity = 0        
acceleration = 0
turningangle = 0
direction = 180
path = [1 for c in range(1970)]
alive = []
# positives are right negatives are left 

def accelerate():
    global acceleration
    global velocity
    global turningangle
    global position
    velocity += 0.434



def decelerate():
    global acceleration
    global velocity
    global turningangle
    global position
    velocity -= 0.434



def turnright():
    global turningangle
    global acceleration
    global velocity
    global position
    global direction
    turningangle += 1.40625
    direction -= 1.40625

def turnleft():
    global turningangle
    global acceleration
    global velocity
    global position
    global direction
    turningangle -= 1.40625
    direction += 1.40625

action = 0

while action < len(path):

   if is_position_in_blue_silhouette(image_path, position):
       previous = [True, copy.deepcopy(path[action]), copy.deepcopy(position)]
   else:
       previous = [False, copy.deepcopy(path[action]), copy.deepcopy(position)]
       
   

   if path[action] == 1 and turningangle == 0:
       accelerate()
       position[0] += (velocity + 0.217) * math.cos(direction)
       position[1] += (velocity + 0.217) * math.sin(direction)
   if path[action] == 2 and turningangle == 0:
       decelerate()
       position[0] += (velocity - 0.217) * math.cos(direction)
       position[1] += (velocity - 0.217) * math.sin(direction)


   if path[action] == 3:
       turnright()
   if path[action] == 4:
       turnleft()



   if turningangle != 0:
       d = 360 * (velocity/(2*math.pi *(1.6/math.tan(turningangle))))
       b = math.sqrt(abs(2*(1.6/ math.tan(turningangle))*(1-math.cos(d))))
       baseangle = (90 - ((180-d)/2))
       position[0] = b * math.cos(direction-baseangle)
       position[1] = b * math.sin(direction-baseangle)
       direction -= d

   if round(position[1], -1) == (3/2) * round(position[0], -1) - 170 and 610 < position[0] < 753:
       position[0] = 797
       position[1] = 690
   if 1050 < position[0] < 1105 and 5 < position[1] < 75:
       print("it did one lap gang")
       break
   if previous[0] == False or not is_position_in_blue_silhouette(image_path, position):
       position = copy.deepcopy(previous[2])
       path[action] == copy.deepcopy(previous [1])+ 1
   if path[action] ==  5:
       path[action] = 0
       action -= 1
   if position == previous[2]:
       previous[0] = False
   print (position)
   print(action)
   plot_position(position)
   print(previous)
   if not is_position_in_blue_silhouette(image_path, position):
       position = copy.deepcopy(previous[2])
# it doesnt work rn

plt.show()

    

       
