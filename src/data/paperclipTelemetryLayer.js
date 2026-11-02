/**
 * Paperclip Telemetry Layer — Connects to the Paperclip control plane
 * on the VPS (192.168.0.6:8080) to stream real-time agent telemetry
 * for the God's Eye View dashboard.
 *
 * This layer subscribes to the /api/paperclip proxy endpoint which
 * forwards telemetry from the Paperclip agent control plane.
 */

import { governorRequestRender } from '../renderGovernor.js';
import { layerFeedState } from './manager.js';

/**
 * PaperclipTelemetryLayer — Manages Paperclip agent telemetry overlay
 */
export class PaperclipTelemetryLayer {
  constructor(viewer, dataManager, opts = {}) {
    this.id = 'paperclip-telemetry';
    this.viewer = viewer;
    this.dataManager = dataManager;
    this.opts = opts;
    this.intervalId = null;
    this.refreshEpoch = 0;
    this.managerRefreshError = null;
    this.enabled = false;
    this.lifecycleState = 'disabled';
    this.lifecycleUncertain = false;
    this.visibilityIntentEpoch = 0;
    this.visibilityIntentEnabled = false;
    this.visibilityIntentOrigin = 'programmatic';
    this.activeVisibilityIntent = null;
    this.latestQueuedAbsoluteIntent = null;
    this.pendingVisibilityAdoptionEpoch = 0;
    this.cachedStats = {
      count: 0,
      lastUpdate: null,
      status: 'unavailable',
      error: null,
    };
    this.connected = false;
  }

  /**
   * Register the layer with the data manager
   */
  register() {
    this.dataManager.register(this);
  }

  /**
   * Start the telemetry refresh loop
   */
  start() {
    if (this.enabled) return;
    this.enabled = true;
    this.lifecycleState = 'loading';

    // Subscribe to Paperclip telemetry endpoint
    this._subscribeToTelemetry();

    // Start periodic refresh
    this.intervalId = setInterval(() => {
      this._refreshTelemetry();
    }, this.opts.refreshInterval || 5000);
  }

  /**
   * Stop the telemetry refresh loop
   */
  stop() {
    this.enabled = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.lifecycleState = 'disabled';
    this.cachedStats = {
      count: 0,
      lastUpdate: null,
      status: 'unavailable',
      error: null,
    };
  }

  /**
   * Subscribe to the Paperclip telemetry WebSocket endpoint
   */
  _subscribeToTelemetry() {
    const wsUrl = `${window.__godsEyeView?.dataManager?.viewer?.scene?.cesiumIonAccessToken
      ? 'ws://'
      : 'http://'}192.168.0.6:8080/paperclip/telemetry`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.connected = true;
        this.lifecycleState = 'nominal';
        console.info('[Paperclip] WebSocket connected to telemetry endpoint');
      };

      this.ws.onmessage = (event) => {
        try {
          const telemetry = JSON.parse(event.data);
          this._processTelemetry(telemetry);
        } catch (e) {
          console.warn('[Paperclip] Failed to parse telemetry message:', e);
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.lifecycleState = 'stale';
        console.warn('[Paperclip] WebSocket disconnected from telemetry endpoint');
        // Attempt reconnection
        setTimeout(() => this._subscribeToTelemetry(), 3000);
      };

      this.ws.onerror = (error) => {
        console.error('[Paperclip] WebSocket error:', error);
        this.lifecycleState = 'degraded';
      };
    } catch (error) {
      console.error('[Paperclip] Failed to establish WebSocket connection:', error);
      this.lifecycleState = 'degraded';
    }
  }

  /**
   * Process incoming telemetry data and update the globe
   * @param {object} telemetry - Parsed telemetry from Paperclip
   */
  _processTelemetry(telemetry) {
    const { agents, timestamp, location } = telemetry || {};

    if (!agents || !Array.isArray(agents)) {
      return;
    }

    // Update cached stats
    this.cachedStats = {
      count: agents.length,
      lastUpdate: timestamp || new Date().toISOString(),
      status: 'nominal',
      error: null,
    };

    // Process each agent and add to the globe
    agents.forEach((agent) => {
      this._addAgentToGlobe(agent);
    });

    // Request render after updating data
    governorRequestRender('paperclip-telemetry');
  }

  /**
   * Add a single agent to the Cesium globe
   * @param {object} agent - Agent telemetry data
   */
  _addAgentToGlobe(agent) {
    const { id, callsign, position, altitude, heading, speed, status } = agent || {};

    if (!position || !position.latitude || !position.longitude) {
      return;
    }

    try {
      // Create a position on the globe
      const cartesian = Cesium.Cartographic.fromDegrees(
        position.longitude,
        position.latitude,
        position.altitude || altitude || 0
      );

      // Create a model matrix for the agent icon
      const headingRad = (heading || 0) * Math.PI / 180;
      const north = new Cesium.Cartesian3(
        Math.cos(headingRad),
        Math.sin(headingRad),
        0
      );

      const east = new Cesium.Cartesian3(
        -Math.sin(headingRad),
        Math.cos(headingRad),
        0
      );

      const up = Cesium.Cartesian3.UNIT_Z;

      const transform = new Cesium.Matrix4();
      transform[0] = north.x;
      transform[1] = north.y;
      transform[2] = north.z;
      transform[3] = east.x;
      transform[4] = east.y;
      transform[5] = east.z;
      transform[8] = up.x;
      transform[9] = up.y;
      transform[10] = up.z;
      transform[12] = cartesian.longitude;
      transform[13] = cartesian.latitude;
      transform[14] = cartesian.height;

      // Create a point primitive
      const agentEntity = this.viewer.entities.add(`paperclip-agent-${id}`);

      agentEntity.position = Cesium.Cartesian3.fromRadians(
        position.longitude,
        position.latitude,
        position.altitude || altitude || 0
      );

      // Set agent icon/model based on status
      const agentClass = this._getAgentClass(status || 'unknown');
      agentEntity.point = {
        pixelSize: 8,
        color: agentClass.color,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        hierarchicalState: Cesium.HierarchicalState.SHOW_AND_HIDE,
        transform: transform,
        // Use a custom agent icon or model
        image: agentClass.icon,
      };

      // Add label with callsign
      agentEntity.label = {
        text: callsign || id || 'Agent',
        font: '14px sans-serif',
        style: Cesium.FontStyle.ITALIC,
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, 8),
      };

      // Track entity for cleanup when agent goes offline
      agentEntity.userData = { id, callsign, lastSeen: Date.now() };

    } catch (error) {
      console.error('[Paperclip] Failed to add agent to globe:', error);
    }
  }

  /**
   * Get agent class/icon based on status
   * @param {string} status - Agent status
   * @returns {{color: Cesium.Color, icon: string}} Agent class info
   */
  _getAgentClass(status) {
    const classes = {
      active: { color: Cesium.Color.YELLOW, icon: '🛡️' },
      online: { color: Cesium.Color.GREEN, icon: '🛰️' },
      idle: { color: Cesium.Color.CYAN, icon: '💤' },
      offline: { color: Cesium.Color.GRAY, icon: '💀' },
      alert: { color: Cesium.Color.RED, icon: '⚠️' },
      critical: { color: Cesium.Color.FUCHSIA, icon: '🔴' },
    };

    return classes[status.toLowerCase()] || classes.idle;
  }

  /**
   * Refresh telemetry data via HTTP fetch (fallback when WebSocket unavailable)
   */
  _refreshTelemetry() {
    fetch('/api/paperclip/status')
      .then((response) => response.json())
      .then((data) => {
        this._processTelemetry(data);
      })
      .catch((error) => {
        console.warn('[Paperclip] HTTP telemetry refresh failed:', error);
        this.cachedStats.status = 'stale';
        this.cachedStats.error = error.message;
        governorRequestRender('paperclip-telemetry');
      });
  }

  /**
   * Get the current feed state for UI display
   * @returns {object} Feed state object
   */
  getStats() {
    return {
      ...this.cachedStats,
      source: 'paperclip',
      feedState: layerFeedState(this.cachedStats),
    };
  }

  /**
   * Toggle layer enabled/disabled state
   */
  setEnabled(enabled, origin = 'programmatic') {
    this.enabled = enabled;

    if (enabled) {
      this.start();
      this.lifecycleState = 'loading';
    } else {
      this.stop();
    }

    // Dispatch event for UI update
    const event = new CustomEvent('gev:paperclip-layer-changed', {
      detail: {
        layerId: 'paperclip-telemetry',
        enabled,
        origin,
      },
    });
    window.dispatchEvent(event);
  }
}

/**
 * Create a Paperclip telemetry layer and register it with the data manager
 * @param {import('./data/manager.js').DataLayerManager} dataManager - The GEV data manager
 * @param {Cesium.Viewer} viewer - The Cesium viewer instance
 * @param {object} opts - Optional configuration
 * @returns {PaperclipTelemetryLayer} The created layer
 */
export function createPaperclipTelemetryLayer(dataManager, viewer, opts = {}) {
  const layer = new PaperclipTelemetryLayer(viewer, dataManager, opts);
  return layer;
}