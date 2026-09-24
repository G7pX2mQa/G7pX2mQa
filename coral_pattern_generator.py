from PIL import Image
import random

source_path = r"C:\Users\leona\OneDrive\CCC\img\currencies\coral\coral_red.webp"
output_path = r"C:\Users\leona\OneDrive\CCC\img\currencies\coral\coral_pattern_red.webp"

canvas_size = 512
num_corals = 500
scale = 0.2
generation_seed = 82

random.seed(generation_seed)

try:
    coral_sprite = Image.open(source_path).convert("RGBA")
except FileNotFoundError:
    print(f"Could not find image at {source_path}")
    exit()

canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))

new_width = max(1, int(coral_sprite.width * scale))
new_height = max(1, int(coral_sprite.height * scale))
resized = coral_sprite.resize((new_width, new_height), Image.Resampling.LANCZOS)

for _ in range(num_corals):
    rotation = random.randint(0, 359)
    rotated = resized.rotate(rotation, expand=True) 

    max_y = canvas_size - rotated.height
    if max_y <= 0:
        continue 
        
    x = random.randint(0, canvas_size - 1)
    y = random.randint(0, max_y)
    
    offsets = [
        (0, 0), 
        (canvas_size, 0), 
        (-canvas_size, 0)
    ]
    
    for offset_x, offset_y in offsets:
        canvas.paste(rotated, (x + offset_x, y + offset_y), rotated)

canvas.save(
    output_path,
    "WEBP",
    lossless=False,
    quality=75,
    alpha_quality=50,
    method=6
)
print(f"Deterministic seamless pattern successfully saved to {output_path}")