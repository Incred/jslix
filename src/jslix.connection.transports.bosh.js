"use strict";
(function(){

    var jslix = window.jslix;

    jslix.Connection.transports.BOSH = function(dispatcher, jid, password, http_base){
        this.queue_check_interval = 250;
        this.established = false;
        this.requests = 1; // TODO: it should be possible to tune these; 2 is more suitable to be default here?
        this.inactivity = 0;
        this.polling = 0;
        this.wait = 60;
        this._sid = null;
        this._slots = [];
        this._queue = [];
        this._rid = Math.round(
            100000.5 + (((900000.49999)-(100000.5))*Math.random()));
        this.jid = jid;
        this.password = password;
        this.http_base = http_base;
        this._dispatcher = dispatcher;
        this._dispatcher.addHandler(this.FeaturesStanza, this);
        this.sasl = this._dispatcher.registerPlugin(jslix.SASL);
        var that = this;
        this.sasl.deferred.done(function() {
            dispatcher.send(that.restart());
        }).fail(function(reason) {
            that.disconnect();
            that._connection_deferred.reject(reason); // TODO: abstract exception
        });
        this._connection_deferred = null;
    }

    var bosh = jslix.Connection.transports.BOSH.prototype;

    bosh.signals = {
        fail: new signals.Signal()
    };
    
    bosh.BOSH_NS = 'http://jabber.org/protocol/httpbind';
    bosh.XBOSH_NS = 'urn:xmpp:xbosh';

    bosh.BodyStanza = jslix.Element({
        xmlns: bosh.BOSH_NS,
        element_name: 'body',
        type: new jslix.fields.StringAttr('type', false),
        condition: new jslix.fields.StringAttr('condition', false)
    });

    bosh.EmptyStanza = jslix.Element({
        rid: new jslix.fields.IntegerAttr('rid', true),
        sid: new jslix.fields.StringAttr('sid', true)
    }, [bosh.BodyStanza]);

    bosh.BaseStanza = jslix.Element({
        ver: new jslix.fields.StringAttr('ver', true),
        wait: new jslix.fields.IntegerAttr('wait', true),
        ack: new jslix.fields.IntegerAttr('ack', false)
    }, [bosh.BodyStanza]);

    bosh.RequestStanza = jslix.Element({
        to: new jslix.fields.JIDAttr('to', true),
        rid: new jslix.fields.IntegerAttr('rid', true),
        hold: new jslix.fields.IntegerAttr('hold', true),
        // XXX: Temporary solution
        xml_lang: new jslix.fields.StringAttr('xml:lang', true),
        content: new jslix.fields.StringAttr('content', false),
        route: new jslix.fields.StringAttr('route', false),
        xmpp_version: new jslix.fields.StringAttr('xmpp:version', true),
        xmlns_xmpp: new jslix.fields.StringAttr('xmlns:xmpp', true)
    }, [bosh.BaseStanza]);

    bosh.ResponseStanza = jslix.Element({
        from: new jslix.fields.JIDAttr('from', true),
        sid: new jslix.fields.StringAttr('sid', true),
        polling: new jslix.fields.IntegerAttr('polling', true),
        inactivity: new jslix.fields.IntegerAttr('inactivity', true),
        requests: new jslix.fields.IntegerAttr('requests', true),
        accept: new jslix.fields.StringAttr('accept', false),
        maxpause: new jslix.fields.IntegerAttr('maxpause', false),
        charsets: new jslix.fields.StringAttr('charsets', false),
        secure: new jslix.fields.StringAttr('secure', false),
        clean_sid: function(value){
            if(!value)
                throw new jslix.exceptions.WrongElement();
            return value;
        }
    }, [bosh.BaseStanza]);

    bosh.RestartStanza = jslix.Element({
        to: new jslix.fields.JIDAttr('to', true),
        xml_lang: new jslix.fields.StringAttr('xml:lang', true),
        xmpp_restart: new jslix.fields.StringAttr('xmpp:restart', true),
        xmlns_xmpp: new jslix.fields.StringAttr('xmlns:xmpp', true)
    }, [bosh.EmptyStanza]);

    bosh.FeaturesStanza = jslix.Element({
        bind: new jslix.fields.FlagNode('bind', false, jslix.Bind.prototype.BIND_NS),
        session: new jslix.fields.FlagNode('session', false, jslix.Session.prototype.SESSION_NS),
        handler: function(top){
            if(top.bind)
                this._dispatcher.registerPlugin(jslix.Bind);
            if(top.session) {
                var session = this._dispatcher.registerPlugin(jslix.Session);
                var that = this;
                session.deferred.done(function() {
                    that._connection_deferred.resolve();
                }).fail(function(reason) {
                    that.disconnect();
                    that._connection_deferred.reject(reason); // TODO: abstract exception
                });
            }
        }
    }, [jslix.stanzas.FeaturesStanza]);

    bosh.connect = function(){
        if (this._connection_deferred) return this._connection_deferred;
        this._connection_deferred = $.Deferred();
        this.send(jslix.build(
            bosh.RequestStanza.create({
                rid: this._rid,
                to: this.jid.getDomain(),
                ver: '1.8',
                wait: this.wait,
                hold: this.requests,
                xml_lang: 'en',
                xmpp_version: '1.0',
                xmlns_xmpp: bosh.XBOSH_NS
            })
        ));

        this.process_queue();
        return this._connection_deferred;
    }

    bosh.send = function(doc){
        if(!doc || doc.firstChild.nodeName != 'body'){
            var body = jslix.build(
                bosh.EmptyStanza.create({
                    sid: this._sid,
                    rid: this._rid
                }));
            if (doc)
                body.firstChild.appendChild(doc.firstChild);
            doc = body;
        }
        this._queue.push(doc);
        this._rid++;
    }

    bosh.restart = function(){
        return bosh.RestartStanza.create({
            sid: this._sid,
            rid: this._rid,
            xml_lang: 'en',
            xmpp_restart: 'true',
            xmlns_xmpp: bosh.XBOSH_NS
        });
    }

    bosh.clean_slots = function(){
        this._slots = this._slots.filter(function(value){
            return !value.closed;
        });
    }

    bosh.process_queue = function(timestamp){
        this.clean_slots();
        if(this.established && 
            !(this._slots.length || this._queue.length) && 
            (this.requests > 1 || new Date().getTime() > timestamp + this.polling * 1000))
            this.send();
        while(this._queue.length){
            this.clean_slots();
            var doc = this._queue.shift(),
                req = this.create_request();
            if(!req) {
                this._queue = [doc].concat(this._queue);
                break;
            }
            req.send(doc);
            timestamp = new Date().getTime();
            this._slots.push(req);
        }
        var connection = this;
        if(this._queue.length || this._slots.length || this.established){
            this._interval = setTimeout(function(){
                connection.process_queue(timestamp);
            }, this.queue_check_interval);
        }
    }

    bosh.process_response = function(response){
        var result = false;
        if(response.readyState == 4){
            if(response.status == 200 && response.responseXML){ // TODO: handle other statuses as well (404 at least)
                var doc = response.responseXML;
                var definitions = [bosh.BodyStanza, bosh.ResponseStanza];
                var top = undefined;
                for (var i=0; i<definitions.length; i++) {
                    try{
                        var top = jslix.parse(doc, definitions[i]);
                    } catch(e){
                        if (!e instanceof jslix.exceptions.WrongElement)
                            return result;
                    }
                }
                if(!top) return result;
                if(!this.established && top.type != 'terminate' && top.sid){
                    this.requests = top.requests;
                    this.wait = top.wait;
                    this.polling = top.polling;
                    this._sid = top.sid;
                    this.established = true;
                }else{
                    if(top.type == 'terminate') {
                        if (this.established)
                            this.established = false;
                        else
                            this._connection_deferred.reject(top.condition); // TODO: abstract exception here
                    }
                }
                while(doc.firstChild.childNodes.length) {
                    this._dispatcher.dispatch(doc.firstChild.childNodes[0]);
                }
                result = true;
            }else{
                this.established = false;
                this.signals.fail.dispatch(response.status);
            }
            response.closed = true;
        }
        return result;
    }

    bosh.create_request = function(){
        if(this._slots.length >= this.requests)
            return null;
        var req = new XMLHttpRequest(),
            connection = this;
        req.open('POST', this.http_base, true);
        req.setRequestHeader('Content-Type', 'text/xml; charset=utf-8');
        req.closed = false;
        req.onreadystatechange = function(){
            return connection.process_response(this);
        }
        return req;
    }

    bosh.suspend = function(){
        if(!this.established){
            return false;
        }
        this.established = false;
        return {
            jid: this.jid.toString(),
            requests: this.requests,
            wait: this.wait,
            polling: this.polling,
            sid: this._sid,
            rid: this._rid
        };
    }

    bosh.resume = function(settings){
        if(this.established){
            return false;
        }
        if(settings['jid'] == this.jid.toString()){
            this.requests = settings['requests'] || this.requests;
            this.wait = settings['wait'] || this.wait;
            this.polling = settings['polling'] || this.polling;
            this._sid = settings['sid'] || this._sid;
            this._rid = settings['rid'] || this._rid;
            this.established = true;
            this.process_queue();
            return true;
        }
        return false;
    }

    bosh.disconnect = function(){
        this.established = false;
        return bosh.EmptyStanza.create({
            sid: this._sid,
            rid: this._rid,
            type: 'terminate'
        });
    }

})();
