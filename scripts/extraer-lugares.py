"""Saca de un extracto .osm.pbf de Colombia los lugares del directorio "Cerca de mí" y los reparte en celdas.

Uso: python extraer-lugares.py <colombia.osm.pbf> <carpeta-salida>
Salida: <carpeta>/<i>_<j>.json con filas [categoria, lat, lng, nombre, direccion, horario, telefono, web]
donde i = floor(lat / 0.05), j = floor(lng / 0.05). Datos © colaboradores de OpenStreetMap (ODbL).
"""
import json
import math
import os
import sys
from collections import defaultdict

import osmium

CELDA = 0.05
# Mismo orden y filtros que src/directorio.ts (el índice de la categoría va en cada fila)
CATEGORIAS = [
    ('panaderia', ['shop=bakery', 'shop=pastry']),
    ('tienda', ['shop=convenience', 'shop=supermarket', 'shop=greengrocer', 'shop=butcher']),
    ('drogueria', ['amenity=pharmacy', 'shop=chemist']),
    ('restaurante', ['amenity=restaurant', 'amenity=fast_food', 'amenity=cafe']),
    ('ferreteria', ['shop=hardware', 'shop=doityourself', 'shop=paint']),
    ('belleza', ['shop=hairdresser', 'shop=beauty', 'shop=barber']),
    ('mascotas', ['amenity=veterinary', 'shop=pet']),
    ('salud', ['amenity=clinic', 'amenity=hospital', 'amenity=doctors', 'amenity=dentist']),
    ('taller', ['shop=car_repair', 'shop=bicycle', 'shop=motorcycle', 'shop=tyres']),
    ('banco', ['amenity=atm', 'amenity=bank']),
    ('papeleria', ['shop=stationery', 'shop=copyshop']),
    ('gasolina', ['amenity=fuel']),
]
CAT_DE = {}
for idx, (_, filtros) in enumerate(CATEGORIAS):
    for f in filtros:
        CAT_DE[tuple(f.split('='))] = idx


def categoria(tags):
    for k in ('shop', 'amenity'):
        v = tags.get(k)
        if v is not None and (k, v) in CAT_DE:
            return CAT_DE[(k, v)]
    return None


def texto(tags, *claves, maximo=90):
    for k in claves:
        v = tags.get(k)
        if v:
            return v.strip()[:maximo]
    return ''


def direccion(tags):
    calle, num = tags.get('addr:street'), tags.get('addr:housenumber')
    if calle and num:
        return f'{calle.strip()} #{num.strip()}'[:90]
    return texto(tags, 'addr:street', 'addr:full')


celdas = defaultdict(list)
total = 0


def agregar(tags, lat, lng):
    global total
    c = categoria(tags)
    if c is None or not (-4.3 < lat < 13.6 and -82 < lng < -66.8):
        return
    fila = [c, round(lat, 5), round(lng, 5), texto(tags, 'name', 'brand'), direccion(tags),
            texto(tags, 'opening_hours', maximo=120), texto(tags, 'phone', 'contact:phone', 'contact:mobile', maximo=40),
            texto(tags, 'website', 'contact:website', maximo=120)]
    # Quita los campos vacíos del final para que los archivos pesen menos
    while len(fila) > 4 and fila[-1] == '':
        fila.pop()
    celdas[(math.floor(lat / CELDA), math.floor(lng / CELDA))].append(fila)
    total += 1


pbf, salida = sys.argv[1], sys.argv[2]
os.makedirs(salida, exist_ok=True)

fp = osmium.FileProcessor(pbf).with_locations().with_filter(osmium.filter.KeyFilter('shop', 'amenity'))
for obj in fp:
    tags = obj.tags
    if obj.is_node():
        agregar(tags, obj.location.lat, obj.location.lon)
    elif obj.is_way():
        pts = [(n.location.lat, n.location.lon) for n in obj.nodes if n.location.valid()]
        if pts:
            agregar(tags, sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))

bytes_totales = 0
for (i, j), filas in celdas.items():
    # El mismo lugar a veces está como punto y como edificio
    vistos, unicas = set(), []
    for f in filas:
        llave = (f[0], f[3].lower(), round(f[1], 3), round(f[2], 3))
        if f[3] and llave in vistos:
            continue
        vistos.add(llave)
        unicas.append(f)
    ruta = os.path.join(salida, f'{i}_{j}.json')
    with open(ruta, 'w', encoding='utf-8') as fh:
        json.dump(unicas, fh, ensure_ascii=False, separators=(',', ':'))
    bytes_totales += os.path.getsize(ruta)

print(f'{total} lugares en {len(celdas)} celdas · {bytes_totales / 1e6:.1f} MB')
