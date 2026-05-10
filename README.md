# weather-god

Detailed weather dashboard deployed as a static GitHub Pages site.

## Features

- Select a preset location or search for a city
- Set model altitude for forecast calculations
- Displays detailed weather data for:
  - Temperature
  - Precipitation
  - Wind
  - Sun (sunrise, sunset, daylight)
- Includes uncertainty hints using forecast spread/probability data

## Data providers

- Forecast: [Open-Meteo Forecast API](https://open-meteo.com/en/docs)
- Geocoding: [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api)

## GitHub Pages deployment

A workflow is included at `/home/runner/work/weather-god/weather-god/.github/workflows/deploy-pages.yml`.

To publish:

1. In GitHub repository settings, enable **Pages** with **GitHub Actions** as source.
2. Push to `main` (or trigger the workflow manually).
3. The workflow deploys the static UI to GitHub Pages.
