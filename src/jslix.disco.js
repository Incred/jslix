"use strict";
(function(){

    var jslix = window.jslix;

    jslix.disco = function(dispatcher, options){
        this.features = options['features'] || [];
        this.identities = options['identities'] || [];
        this._dispatcher = dispatcher;
        this._dispatcher.addHandler(jslix.disco.stanzas.request, this);
    }

    jslix.disco._name = 'jslix.disco';

    jslix.disco.DISCO_NS = 'http://jabber.org/protocol/disco#info';

    jslix.disco.stanzas = {};

    jslix.disco.stanzas.response = jslix.Element({
        xmlns: jslix.disco.DISCO_NS
    }, [jslix.stanzas.query]);

    jslix.disco.stanzas.request = jslix.Element({
        xmlns: jslix.disco.DISCO_NS,
        result_class: jslix.disco.stanzas.response,
        getHandler: function(query, top){
            var result = query.makeResult({});
            for(var i=0; i<this.identities.length; i++){
                result.link(this.identities[i]);
            }
            for(var i=0; i<this.features.length; i++){
                var feature = jslix.disco.stanzas.feature.create({
                    feature_var: this.features[i]
                });
                result.link(feature);
            }
            return result;
        }
    }, [jslix.stanzas.query]);

    jslix.disco.stanzas.feature = jslix.Element({
        parent_element: jslix.disco.stanzas.response,
        xmlns: jslix.disco.DISCO_NS,
        element_name: 'feature',
        feature_var: new jslix.fields.StringAttr('var', true)
    });

    jslix.disco.stanzas.identity = jslix.Element({
        parent_element: jslix.disco.stanzas.response,
        xmlns: jslix.disco.DISCO_NS,
        element_name: 'identity',
        category: new jslix.fields.StringAttr('category', true),
        type: new jslix.fields.StringAttr('type', true),
        name: new jslix.fields.StringAttr('name', false)
    });

})();
