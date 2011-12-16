/*
 * requires leaflet, jquery 1.1.4, mustache
 */ 
$.widget("ui.shareabout", (function() {
  var map, // leaflet map
      fsm, // state machine
      newFeature, // marker for proposed feature
      hint, // label layer with UX hints
      features, // object that stores map features by their ID
      popup; // one popup on the map
    
  return {
    options : {
      map : {
        tileUrl         : null, 
        center          : null,
        tileAttribution : '', 
        maxZoom         : 18,
        initialZoom     : 13,
        markerIcon      : null, // custom icon
        newMarkerIcon   : null, // custom icon for markers representing unsaved features
        crosshairIcon   : null // icon for crosshair used when locating on touch screen devices
      },
      withinBounds         : true,                 
      featuresUrl          : null, // url to all features geoJSON
      // featurUrl: url to feature json - should return a 'view' that contains popup content, resource ID should be indicated as FEATURE_ID to be subbed
      featureUrl           : null, 
      features             : [], // array of geojson objects to add to map. will be added to what's returned from featuresUrl
      featurePopupTemplate : null, 
      callbacks : {
        onready : function() {}, // after transitioning to "ready" state (closed popups, clean slate)
        onload  : function() {}, // after the map is initially loaded
        onpopup : function() {}  // after a popup is opened
      }
    },
  
    /**
     * Constructor
     */
    _create : function() {
      var self = this;

      features = {};
      popup    = this._small_screen() ? new InformationPanel({ onRemove : function() { self._resetState(); } }) : new L.SidePopup();
      map      = new L.Map( this.element.attr("id") );
      
      // Set up Leaflet map
      map.setView(this.options.map.center, this.options.map.initialZoom);
      map.addLayer(new L.TileLayer( this.options.map.tileUrl, {
        maxZoom: this.options.map.maxZoom, attribution: this.options.map.tileAttribution
      }));
      map.on('layerremove', function(e){ if (e.layer == popup) self._resetState(); });
      map.on('click', function(e){ self._removePopup(); });
            
      // Initial map feature load
      this.loadFeatures(this.options.features, self.options.callbacks.onload);
      this.options.features = []; // prevent reloading
      this.options.callbacks.onload = function(){}; // prevent multiple onload callbacks
      
      this._init_states();
      this.options.callbacks.onready(); // manually trigger transition to ready state
      
      // If we're only loading features that are within the viewing bounds, load more features when bounds change
      if (this.options.withinBounds) {
        map.on('dragend', function(e){ self.loadFeatures() })
        map.on('zoomend', function(e){ self.loadFeatures() })
        map.on('viewreset', function(e){ self.loadFeatures() })
        $(window).resize( function(e){ self.loadFeatures() })
      }      
    },
    
    /*****************
      PUBLIC
    *****************/
    
    /**
     * Drops a pin on the map - at latLng, if provided, or map center. 
     * Advances map state to locatingFeature. 
     * Can be called from ready state.
     * @param {L.LatLng} latLng the optional location to place the locating marker.
     */
    locateNewFeature : function(latLng) {
      fsm.locateNewFeature(latLng);
    },
    
    /**
     * Gets the form via the ajax options passes in. 
     * Unless otherwise specified via success callback, loads form into popup for newFeature marker.
     * @param {Object} ajaxOptions options for jQuery.ajax(). By default, success loads responseData.view into popup.
     */
    loadNewFeatureForm : function(ajaxOptions) {
      fsm.loadNewFeatureForm(ajaxOptions);
    },
    
    finalizeNewFeature : function() {
      fsm.finalizeNewFeature();
    },
    
    submitNewFeature : function(ajaxOptions) {
      fsm.submitNewFeature(ajaxOptions);
    },
      
    /**
     * Returns the leaflet map
     */
    getMap : function () { return map; },
    
    /**
     * Returns the info popup
     */
    getPopup : function () { return popup; },
  
    /**
     * Returns the state machine object
     */
    state : function () { return fsm; },
    
    /**
     * Returns the new Feature marker
     */
    getNewFeatureMarker : function () { return newFeature },
  
    /**
     * Opens the popup for a feature
     */
    viewFeature : function(fId) {
      fsm.viewFeature(fId);
    },
    
    /**
     * Add a click listener within the map popup (SidePopup only). 
     * @param {String} selector CSS selector (within popup) to element(s) on which to add listener.
     * @param {function} callback function to be called on click of selected element
     */
    addClickEventListenerToPopup : function(selector, callback) {
      popup.addClickEventListener(selector, callback);
    },
    
    loadFeatures : function(geojson, callback){
      if (!this.options.featuresUrl) return;
       
      var url = this.options.featuresUrl;
      
      if (this.options.withinBounds) {
        var bounds = map.getBounds(),
            boundsQ = "bounds[]=" + bounds.getNorthEast().lng + "," + bounds.getNorthEast().lat + 
          "&bounds[]=" + bounds.getSouthWest().lng + "," + bounds.getSouthWest().lat;
        
        url += ( this.options.featuresUrl.indexOf("?") != -1 ? "&" : "?") + boundsQ;
      }
      
      var self = this;
      $.getJSON(url, function(data){
        var geojsonLayer = new L.GeoJSON(null, {
          pointToLayer : function(latlng) {            
            var markerOpts = {};
            if ( self.options.map.markerIcon ) markerOpts.icon = new shareabout.options.map.markerIcon();
            return new L.Marker(latlng, markerOpts);
          }
        });

        // Triggered as features are individually parsed
        geojsonLayer.on('featureparse', function(featureparse) {
          self._setupMarker(featureparse.layer, featureparse.properties);
        });

        if (typeof data == "object") data = data.features;
        if(geojson) data = data.concat(geojson);
        
        $.each(data, function(i,f) { if (!features[f.properties.id]) geojsonLayer.addGeoJSON(f); });
        map.addLayer(geojsonLayer);
        
        if (callback) callback();
      });
    },
  
    /*
     * Private
     */
    // Centers the map at a point that will center the actual point of interest in the visible view
    _scrollViewTo : function(latLng) {
      var mapWidth  = this.element[0].offsetWidth,
          mapHeight = this.element[0].offsetHeight;

      if (this._small_screen()) {
        var ratioY = -0.37; // percentage of map height between map center and focal point, hard coded bad
        map.panBy( new L.Point(0, mapHeight * ratioY) );
      } else {
        var ratioX = 1/6; // percentage of map width between map center and focal point, hard coded bad
        map.panBy( new L.Point(mapWidth * ratioX, 0) );
      }
    },
    
    _small_screen : function() {
      return this.element[0].offsetWidth <= 400;
    },
    
    _resetState : function() {
      if (fsm.can("ready")) fsm.ready();
      else if (fsm.can("cancel")) fsm.cancel();
    },
    
    _openPopupWith : function(layer, content) {
      popup.setContent(content || layer._html);
      popup.setLatLng(layer.getLatLng());

      // Transitioning from leaflet popup to InformationPanel
      if (popup instanceof InformationPanel) {
        this._scrollViewTo( layer.getLatLng() );
        popup.open( this._small_screen() );
        this.options.callbacks.onpopup();
      } else {
        map.setView( layer.getLatLng(), map.getZoom(),true );
        if (!popup._opened) map.addLayer( popup );
      }
    },
    
    _removePopup : function() {
      // Transitioning from leaflet popup to InformationPanel
      if (popup instanceof InformationPanel && popup._opened()) popup.remove();
      else if (popup._opened) map.removeLayer(popup);
    },
  
    _setupMarker : function(marker, properties) {
      var shareabout = this,
          fId = properties.id;
      
      if (this.options.featurePopupTemplate)
        marker._html = $.mustache( this.options.featurePopupTemplate, properties );
    
      marker._id = fId;
      marker.on("click", function(click){
        if (fsm.can("ready")) fsm.ready();
        else if (fsm.can("cancel")) fsm.cancel();
        
        shareabout.viewFeature(this._id);
      });
    
      features[fId] = marker;
    },
    
    _touch_screen : function() {
      return('ontouchstart' in window);
    },
    
    _remove_hint : function() {
       map.removeLayer(hint);
       $(".mobile-hint-overlay").remove();
    },
    
    _destroyMarker : function(layer) {
      if (!layer) return;
      
      map.removeLayer(layer);
      layer = null;
    },
  
    _init_states : function() {
      var shareabout = this;
      
      // State machine handles the flow of creating and viewing map features
      fsm = StateMachine.create({
        initial : 'ready',
        events  : [
          // UI triggered. drops a marker onto the map. if passed L.LatLng, drops marker there.
          { name: 'locateNewFeature', from: ['ready', 'viewingFeature'], to: 'locatingNewFeature'},
          // UI triggered. can move from ready to loadingNewFeatureForm without first locating if location not required, chosen later, etc
          // if feature is already located, pass geoJSON representation of feature to loadNewFeatureForm
          { name: 'loadNewFeatureForm', from: ['ready', 'locatingNewFeature'], to: 'loadingNewFeatureForm'},
          // called internally after form has been loaded
          { name: 'finalizeNewFeature', from: 'loadingNewFeatureForm', to: 'finalizingNewFeature'},
          // UI triggered. pass geoJSON representation to transition and callback on success
          { name: 'submitNewFeature', from: ['finalizingNewFeature', 'locatingNewFeature'], to: 'submittingNewFeature'},
          // called internally after response from submit, if data status is error
          { name: 'errorNewFeature', from: 'submittingNewFeature', to: 'finalizingNewFeature'},
          // UI triggered. Pass ID of feature to view.
          { name: 'viewFeature', from: ['ready', 'locatingNewFeature', 'finalizingNewFeature', 'submittingNewFeature', 'viewingFeature'], to: 'viewingFeature'},
          // Ways to get back to ready
          { name: 'ready', from : ['ready', 'submittingNewFeature', 'viewingFeature'], to: 'ready'},
          { name: 'cancel', from: ['locatingNewFeature', 'finalizingNewFeature'], to: 'ready'}
        ]
      });
    
      fsm.onchangestate = function(eventName, from, to) { 
        // if (window.console) window.console.info("Transitioning from " + from + " to " + to + " via " + eventName);
      };
      
      /*
       * If touch screen, displays crosshair, else
       * Drops a marker on the map at the latlng, if provided, or in the middle
       */
      fsm.onlocateNewFeature = function (eventName, from, to, latlng) {   
        if (shareabout._touch_screen()) {
          var crosshairIcon = new shareabout.options.map.crosshairIcon();
          var wrapper = $("<div>").attr("id", "crosshair"),
              img     = $("<img>").attr("src", crosshairIcon.iconUrl);
              
          shareabout.element.append(wrapper.html(img));
          
          $("#crosshair").css("left", shareabout.element[0].offsetWidth/2 - crosshairIcon.iconAnchor.x + "px");
          $("#crosshair").css("top", shareabout.element[0].offsetHeight/2 - crosshairIcon.iconAnchor.y + "px");
                    
          hint = $("<div>").attr("class", "mobile-hint-overlay").html("Drag your location to the center of the map");
          shareabout.element.append(hint);
          map.on("drag", function(drag) { shareabout._remove_hint() } );               
        } else {
          if (!latlng) latlng = map.getCenter();

          var markerOpts = { draggable : true };
          if ( shareabout.options.map.newMarkerIcon ) markerOpts.icon = new shareabout.options.map.newMarkerIcon();

          newFeature = new L.Marker(latlng, markerOpts);
          map.addLayer(newFeature);

          hint = new L.LabelOverlay(latlng, "Drag me!");
          map.addLayer(hint);
          newFeature.on("drag", function(drag) { shareabout._remove_hint() } );               
        }
      };
      
      /*
       * Performs an ajax request. 
       * By default, if the json response contains a view property, that will be displayed in the marker popup.
       */
      fsm.onloadNewFeatureForm = function (eventName, from, to, ajaxOptions) {
        if (newFeature && newFeature.dragging._enabled)
          newFeature.dragging.disable();
        else {
          newFeature = new L.Marker(map.getCenter(), {icon : new shareabout.options.map.crosshairIcon(), clickable : false, draggable : false});
          map.addLayer(newFeature); 
          $("#crosshair").remove();                
        }
          
        if (hint && hint._opened) map.removeLayer(hint)
        
        var ajaxCfg = { 
          type : 'GET', 
          success: function(data){
            if (data.view) {
              shareabout._openPopupWith(newFeature, $("<div>").html($("<div class='shareabouts submit'>").html(data.view)).html());
            }
            shareabout.finalizeNewFeature();
          },
          dataType : 'json'
        };
        
        if ( typeof ajaxOptions == "object" ) $.extend(true, ajaxCfg, ajaxOptions);
        $.ajax(ajaxCfg);
      };
      
      /*
       * Submits new feature form. 
       */
       fsm.onsubmitNewFeature = function (eventName, from, to, ajaxOptions) {
         var ajaxCfg = {
           type : 'POST',
           success : function(data) {
             if (data.status && data.status == "error")
               fsm.errorNewFeature(null, data);
             else
               fsm.viewFeature(data.geoJSON.properties.id, data);
           }
         };
         if ( typeof ajaxOptions == "object" ) $.extend(true, ajaxCfg, ajaxOptions);
         $.ajax(ajaxCfg);
      };

      /*
       * Creates a marker for the new feature using the properties in responseData.geoJSON. 
       */
      fsm.onleavesubmittingNewFeature = function (eventName, from, to, id, responseData) {
        if (to == "viewingFeature") {
          var markerOpts = { };
          if ( shareabout.options.map.markerIcon ) markerOpts.icon = new shareabout.options.map.markerIcon();

          var marker = new L.Marker(newFeature.getLatLng(), markerOpts);

          shareabout._setupMarker(marker, responseData.geoJSON.properties);

          shareabout._destroyMarker(newFeature);
          map.addLayer(marker);
        } else if (to == "finalizingNewFeature") {
          $(".shareabouts-side-popup-content").html(responseData.view);
        }
      };
      
      /*
       * 
       */
      fsm.onviewFeature = function(eventName, from, to, fId) {
        if (features[fId]._html) {
          shareabout._openPopupWith( features[fId] );
        } else {
          var resource_path = shareabout.options.featureUrl.replace(/FEATURE_ID/, fId);
          $.get( resource_path, function(data){
            shareabout._openPopupWith( features[fId], data.view);
            if (window.history && window.history.pushState) window.history.pushState(null, null, resource_path);
          }, "json");
        }
      };
      
      fsm.onleaveviewingFeature = function(eventName, from, to) {
        shareabout._removePopup();
      };
      
      fsm.onleavelocatingNewFeature = function(eventName, from, to) {
        if (hint && hint._opened) map.removeLayer(hint);
        if (to != "loadingNewFeatureForm"){ 
          $("#crosshair").remove();
          shareabout._destroyMarker(newFeature);
        }
      };
      
      /*
       * Removes all the layers related to feature submission. 
       */
      fsm.oncancel = function (eventName, from, to) {
        $("#crosshair").remove();
        shareabout._removePopup();
        shareabout._destroyMarker(newFeature);
      };
      
      /*
       * 
       */
      fsm.onready = function (eventName, from, to) {
        shareabout._removePopup();
        
        shareabout.options.callbacks.onready();
      };      
    }
  }; // end widget function return
})());