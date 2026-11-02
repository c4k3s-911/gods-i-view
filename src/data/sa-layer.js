/**
 * South Africa (SA) Layer Extension — Integrates the SA layer extension
 * from HaCakeSec_za pentest project into God's Eye View.
 *
 * This layer wires the southAfricanFeed data into the GEV rendering pipeline,
 * providing South Africa-specific aerial and satellite data overlays.
 */

import { createSouthAfricaLayer } from '../layers/sa-layer-extension.js';
import { governorRequestRender } from '../renderGovernor.js';

/**
 * SAFeedLayer — Manages South Africa data feed integration
 */
export class SAFeedLayer {
  constructor(viewer, dataManager, opts = {}) {
    this.viewer = viewer;
    this.dataManager = dataManager;
    this.opts = opts;
    this.layer = null;
    this.enabled = false;
    this.refreshInterval = opts.refreshInterval || 15000;
    this.lastUpdate = null;
  }

  /**
   * Create and register the SA layer with the data manager
   */
  createAndRegister() {
    // Create the SA layer using the extension contract
    this.layer = createSouthAfricaLayer({
      surface: {
        groundFloor: this._createGroundFloor(),
        meshFloor: this._createMeshFloor(),
        groundSnap: this._createGroundSnap(),
      },
      source: 'southAfricaFeed',
    });

    // Register with data manager
    this.dataManager.register(this.layer);

    // Attach to tileset if available
    if (this.layer.source && this.layer.source.groundFloor) {
      this.layer.source.groundFloor.attachTileset(this.viewer.cesium?.cesiumRenderer?.tileset);
    }

    this.enabled = true;
    console.info('[SA Layer] South Africa feed layer created and registered');
    governorRequestRender('sa-layer');
  }

  /**
   * Enable/disable the SA layer
   * @param {boolean} enabled - Whether to enable the layer
   * @param {string} origin - Origin of the enable action ('user', 'voice', 'tool')
   */
  setEnabled(enabled, origin = 'programmatic') {
    this.enabled = enabled;

    if (enabled && !this.layer) {
      this.createAndRegister();
    } else if (this.layer && !enabled) {
      this.dataManager.unregister(this.layer.id);
      this.layer = null;
    }

    // Dispatch event for UI update
    const event = new CustomEvent('gev:sa-layer-changed', {
      detail: {
        layerId: this.layer?.id || 'sa-layer',
        enabled,
        origin,
      },
    });
    window.dispatchEvent(event);
  }

  /**
   * Create ground floor surface for the SA layer
   * @returns {object} Ground floor surface object
   */
  _createGroundFloor() {
    return {
      type: 'groundFloor',
      region: 'ZA',
      services: {
        render: () => {
          // Render SA-specific ground data
          console.debug('[SA Layer] Rendering ground floor');
        },
        update: () => {
          // Update ground floor data
        },
      },
    };
  }

  /**
   * Create mesh floor surface for the SA layer
   * @returns {object} Mesh floor surface object
   */
  _createMeshFloor() {
    return {
      type: 'meshFloor',
      region: 'ZA',
      services: {
        render: () => {
          // Render mesh floor data
          console.debug('[SA Layer] Rendering mesh floor');
        },
        update: () => {
          // Update mesh floor data
        },
      },
    };
  }

  /**
   * Create ground snap surface for the SA layer
   * @returns {object} Ground snap surface object
   */
  _createGroundSnap() {
    return {
      type: 'groundSnap',
      region: 'ZA',
      services: {
        snapToGround: (position) => {
          // Snap position to ground
          return position; // Return snapped position
        },
      },
    };
  }

  /**
   * Get the current feed state for UI display
   * @returns {object} Feed state object
   */
  getStats() {
    return {
      source: 'southAfricaFeed',
      region: 'ZA',
      lastUpdate: this.lastUpdate,
      enabled: this.enabled,
    };
  }

  /**
   * Refresh the SA layer data
   */
  refresh() {
    if (!this.layer) return;

    // Refresh SA layer data
    this.lastUpdate = new Date().toISOString();

    // Request render after refresh
    governorRequestRender('sa-layer-refresh');
  }
}

/**
 * Create a SA feed layer and register it with the data manager
 * @param {import('./data/manager.js').DataLayerManager} dataManager - The GEV data manager
 * @param {Cesium.Viewer} viewer - The Cesium viewer instance
 * @param {object} opts - Optional configuration
 * @returns {SAFeedLayer} The created layer
 */
export function createSAFeedLayer(dataManager, viewer, opts = {}) {
  const layer = new SAFeedLayer(viewer, dataManager, opts);
  return layer;
}