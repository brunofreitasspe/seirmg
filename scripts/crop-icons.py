from PIL import Image

SRC = "icones/icones.png"
OUT_DIR = "src/assets/icons"

REGIONS = {
    "icon-128.png": (90, 15, 510, 435),
    "icon-48.png": (685, 70, 1005, 390),
    "icon-32.png": (179, 567, 419, 807),
    "icon-16.png": (741, 595, 951, 805),
}

SIZES = {
    "icon-128.png": 128,
    "icon-48.png": 48,
    "icon-32.png": 32,
    "icon-16.png": 16,
}

def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    for filename, box in REGIONS.items():
        recorte = im.crop(box)
        tamanho = SIZES[filename]
        redimensionado = recorte.resize((tamanho, tamanho), Image.LANCZOS)
        redimensionado.save(f"{OUT_DIR}/{filename}")
        print(f"gerado {OUT_DIR}/{filename} ({tamanho}x{tamanho})")

if __name__ == "__main__":
    main()
