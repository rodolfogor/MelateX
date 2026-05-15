import requests
from bs4 import BeautifulSoup
import json
import re

def scrape_melate_retro():
    url = "https://www.loterianacional.gob.mx/MelateRetro/Resultados"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9',
        'Cache-Control': 'no-cache'
    }
    
    print(f"Obteniendo datos reales de {url}...")
    response = requests.get(url, headers=headers, timeout=15)
    if response.status_code != 200:
        print("Error al acceder a la página")
        return

    soup = BeautifulSoup(response.text, 'html.parser')
    results = []

    # Buscamos todas las tablas y seleccionamos la que contiene los resultados históricos
    # Normalmente es la tabla que tiene el encabezado "Sorteo" y "Combinación"
    target_table = None
    tables = soup.find_all('table')
    for t in tables:
        header_text = t.get_text().lower()
        # Buscamos la tabla que contenga los encabezados típicos de resultados históricos
        if 'combinación' in header_text and 'sorteo' in header_text and 'fecha' in header_text:
            if 'naturales' not in header_text: # Evitar tabla de premios
                target_table = t
                break

    rows = target_table.find_all('tr')[1:] if target_table else []

    if not rows:
        # Fallback por si la estructura cambia a divs informativos
        rows = soup.find_all('div', class_='result-item') or soup.find_all('div', class_='sorteo-item')

    if not rows:
        print("⚠️ No se pudo encontrar la estructura de resultados en la página.")
        return

    for item in rows[:25]: # Tomamos los últimos 25
        try:
            if item.name == 'tr':
                cols = item.find_all('td')
                if len(cols) < 3: continue
                sorteo = cols[0].text.strip()
                fecha = cols[1].text.strip()
                nums_raw = cols[2].text.strip()
            else:
                # Fallback para estructura de divs
                sorteo = item.find(class_='draw-number').text.strip()
                fecha = item.find(class_='draw-date').text.strip()
                nums_raw = item.find(class_='numbers').text.strip()
            
            # Limpiamos espacios extras y convertimos a formato coma
            # Esto maneja casos donde los números vienen separados por espacios, guiones o puntos
            nums_all = re.findall(r'\d+', nums_raw)
            if not nums_all:
                continue
                
            # Melate Retro son 6 números. Tomamos los primeros 6.
            nums_str = ",".join(nums_all[:6])

            # Limpieza básica de sorteo (quitar '#' o texto)
            sorteo_clean = "".join(filter(str.isdigit, sorteo))
            
            # Convertir fecha de "DD/MM/YYYY" a "YYYY-MM-DD" para máxima compatibilidad con JS
            fecha_parts = re.findall(r'\d+', fecha)
            if len(fecha_parts) == 3:
                # Asumiendo DD/MM/YYYY o DD-MM-YYYY
                d, m, y = fecha_parts
                if len(y) == 2: y = "20" + y
                fecha_iso = f"{y}-{m.zfill(2)}-{d.zfill(2)}"
            else:
                # Si la fecha tiene nombres de meses (ej. 17 de Marzo)
                meses = {'enero':'01','febrero':'02','marzo':'03','abril':'04','mayo':'05','junio':'06',
                         'julio':'07','agosto':'08','septiembre':'09','octubre':'10','noviembre':'11','diciembre':'12'}
                fecha_low = fecha.lower()
                fecha_iso = fecha # fallback
                for mes_nom, mes_num in meses.items():
                    if mes_nom in fecha_low:
                        day_match = re.search(r'\d+', fecha_low)
                        year_match = re.search(r'\d{4}', fecha_low)
                        if day_match and year_match:
                            day = day_match.group()
                            year = year_match.group()
                            fecha_iso = f"{year}-{mes_num}-{day.zfill(2)}"
                            break
            
            results.append({
                "sorteo": int(sorteo_clean),
                "fecha": fecha_iso,
                "combinacion": nums_str
            })
        except:
            continue

    if results:
        with open('melate_retro_results.json', 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        print(f"✅ ¡Éxito! Se actualizaron {len(results)} sorteos reales.")

if __name__ == "__main__":
    scrape_melate_retro()
