from PIL import Image
import matplotlib.pyplot as plt
import math
import random
import copy

def is_position_in_blue_silhouette(image_path, position):
    img = Image.open(image_path).convert("RGBA")
    pixels = img.load()
    x, y = position
    y = img.height - y
    if x < 0 or y < 0 or x >= img.width or y >= img.height:
        return False
    r, g, b, a = pixels[x, y]
    if r < 90 and g > 130 and b > 120:
        return True
    return False

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
direction = 180
path = [1 for c in range(1970)]
alive = []

previous_positions = []

def accelerate():
    global velocity
    velocity += 0.434

def decelerate():
    global velocity
    velocity -= 0.434

def turnright():
    global direction
    direction -= 1.40625

def turnleft():
    global direction
    direction += 1.40625

action = 0
tries = 1
while action < len(path):
    
    previous_positions.append(copy.deepcopy(position))

    
    if path[action] == 1:
        accelerate()
    if path[action] == 2:
        decelerate()
    if path[action] == 3:
        turnright()
    if path[action] == 4:
        turnleft()
    
    rad_direction = math.radians(direction)
    dx = velocity * math.cos(rad_direction)
    dy = velocity * math.sin(rad_direction)
    position[0] += dx
    position[1] += dy
    
    if round(position[1], -1) == (3/2) * round(position[0], -1) - 170 and 610 < position[0] < 753:
        position[0] = 797
        position[1] = 690
    if 1050 < position[0] < 1105 and 5 < position[1] < 75:
        print("it did one lap gang")
        break
    if not is_position_in_blue_silhouette(image_path, position):
        position = copy.deepcopy(previous_positions[(action - 1)])
        path[action] += 1
        if path[action] == 5:
            path[action] = 0
            action -= 1
            tries += 1
            position = copy.deepcopy(previous_positions[(action - tries)])

    print(position)
    print(action)
    print (previous_positions)
    print
    plot_position(position)

plt.show()



    

       
