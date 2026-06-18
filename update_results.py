import requests
import json

# Este endpoint regresa un CSV directo con el histórico de Melate Retro,
# incluyendo la columna BOLSA (premio acumulado de ese sorteo).
# Formato: NPRODUCTO,CONCURSO,F1,F2,F3,F4,F5,F6,F7,BOLSA,FECHA
CSV_URL = "https://www.loterianacional.gob.mx/Home/Historicos?ARHP=TQBlAGwAYQB0AGUALQBSAGUAdAByAG8A"


def scrape_melate_retro():
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'es-ES,es;q=0.9',
        'Cache-Control': 'no-cache'
    }

    print(f"Descargando histórico CSV de {CSV_URL}...")
    response = requests.get(CSV_URL, headers=headers, timeout=15)
    if response.status_code != 200:
        print(f"Error al acceder al CSV (status {response.status_code})")
        return

    lines = response.text.strip().splitlines()
    results = []

    # La primera línea es el encabezado (NPRODUCTO,CONCURSO,F1...F6,F7,BOLSA,FECHA), la saltamos
    for line in lines[1:]:
        line = line.strip()
        if not line:
            continue

        parts = line.split(',')
        if len(parts) < 11:
            continue

        try:
            sorteo = int(parts[1].strip())
            combinacion = ",".join(p.strip().zfill(2) for p in parts[2:8])  # F1-F6 (6 números)
            adicional = int(parts[8].strip())  # F7 (número adicional)
            bolsa = float(parts[9].strip()) if parts[9].strip() else 0

            # Fecha viene como DD/MM/YYYY, la convertimos a YYYY-MM-DD
            d, m, y = parts[10].strip().split('/')
            fecha_iso = f"{y}-{m.zfill(2)}-{d.zfill(2)}"

            results.append({
                "sorteo": sorteo,
                "fecha": fecha_iso,
                "combinacion": combinacion,
                "adicional": adicional,
                "bolsa": bolsa
            })
        except (ValueError, IndexError):
            continue

    # El CSV trae el histórico completo desde el inicio del juego; lo guardamos todo
    print(f"Se encontraron {len(results)} sorteos en el CSV.")

    if results:
        with open('melate_retro_results.json', 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        print(f"✅ ¡Éxito! Se actualizaron {len(results)} sorteos reales (incluyendo bolsa).")
    else:
        print("⚠️ No se encontraron resultados válidos en el CSV.")


if __name__ == "__main__":
    scrape_melate_retro()
