/**
 * SA Layer Extension — South Africa focus (flights / satellite / radar / weather)
 *
 * Source: afriwx.co.za satellite + meteox radar widget + Flightradar24 API sandbox
 * Pairing: netwatch (diag overlay) + webssh (remote session) via REA MCP bridge
 *
 * This module provides the SA data feed configuration and layer creation contract
 * for integration with God's Eye View's data layer manager.
 */

// SA layer extension — South Africa focus (flights / satellite / radar / weather)
// Source: afriwx.co.za satellite + meteox radar widget + Frightradar24 API sandbox
// Pairing: netwatch (diag overlay) + webssh (remote session) via REA MCP bridge

export const saFeedConfig = {
  name: 'southAfricaFeed',
  region: 'ZA',
  flights: {
    provider: 'fr24api-mcp',
    repo: 'https://github.com/Flightradar24/fr24api-mcp.git',
    tokenSandbox: '01a1930f-a118-72a5-899c-a12a8e16a9d4', // sandbox only — do not commit
    endpoint: 'https://fr24api.com/live-flight-data',
  },
  satellite: {
    source: 'afriwx.co.za',
    fullDiscUrl: 'https://afriwx.co.za/satellite/full-discs/',
    imageSet: ['visible', 'infrared', 'water-vapor'],
  },
  weatherRadar: {
    rainWidget: 'https://widgets.meteox.com/en-GB/widgets/radar/continent/af/rain',
    satWidget: 'https://widgets.meteox.com/en-GB/widgets/radar/continent/af/satellite',
    embedSandbox: 'allow-scripts allow-popups allow-popups-to-escape-sandbox',
  },
};

// Integration contract for gods-AI-view src/app/layers/
export function createSouthAfricaLayer({ surface, source }) {
  const { groundFloor, meshFloor, groundSnap } = surface;
  // Return layer object; wire source into renderGovernor / trackedCamera
  return {
    id: saFeedConfig.name,
    region: saFeedConfig.region,
    source,
    services: { groundFloor, meshFloor, groundSnap },
  };
}

// Netwatch overlay pairing (optional diagnostic layer)
export const netwatchOverlay = {
  enable: true,
  source: 'netwatch',
  metrics: ['latency', 'packet-loss', 'route-drift'],
};

// WebSSH remote session pairing (optional session layer)
export const websshLayer = {
  enable: true,
  source: 'webssh',
  sessionType: 'remote-terminal',
};