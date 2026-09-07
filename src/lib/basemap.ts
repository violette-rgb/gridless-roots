import type { StyleSpecification } from "maplibre-gl";

/**
 * Keyless raster basemap built on OpenStreetMap standard tiles.
 * No API key, no token, no account required.
 */
export function osmDarkStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles: [
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#16222e" } },
      {
        id: "basemap",
        type: "raster",
        source: "basemap",
        paint: {
          // pull the bright OSM raster down into the app's near-black palette
          "raster-brightness-max": 0.62,
          "raster-brightness-min": 0.02,
          "raster-contrast": 0.1,
          "raster-saturation": -0.55,
          "raster-hue-rotate": 165,
          "raster-opacity": 1,
        },
      },
    ],
  };
}
