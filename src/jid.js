"use strict";
define(['jslix/class', 'jslix/exceptions'], function(Class, exceptions){

    var JID_FORBIDDEN = ['"',' ','&','\'','/',':','<','>','@'];

    var codesForEscape = {
        ' ' : '20',
        '"' : '22',
        '&' : '26',
        '\'' : '27',
        '/' : '2f',
        ':' : '3a',
        '<' : '3c',
        '>' : '3e',
        '@' : '40',
        '\\' : '5c'
    };

    var codesForUnescape = {};

    for(var key in codesForEscape)
      codesForUnescape[codesForEscape[key]] = key;

    var JID = function(jid){
        if (typeof(jid) == 'string'){
           if (jid.indexOf('@') != -1){
              this.node = jid.substring(0, jid.indexOf('@'));
              jid = jid.substring(jid.indexOf('@') + 1);
           }else{
                this.node = '';
           }

          if (jid.indexOf('/') != -1){
             this.resource = jid.substring(jid.indexOf('/') + 1);
             jid = jid.substring(0, jid.indexOf('/'));
          }else{
             this.resource = '';
          }
          this.domain = jid;
        }else{
           this.node = jid.node;
           this.domain = jid.domain;
           this.resource = jid.resource;
        }
    };

    JID.exceptions = {
        JIDInvalidException: Class(exceptions.Error, function(msg){
            exceptions.Error.call(this, msg);
            this.name = "JIDInvalidException";
        })
    };

    var JIDInvalidException = JID.exceptions.JIDInvalidException;

    JID.prototype = {
        get node(){
            return this._node;
        },
        set node(new_node){
            this._node = JID._checkNodeName(new_node);
        },
        get domain(){
            return this._domain;
        },
        set domain(new_domain){
            if(!new_domain){
                throw new JIDInvalidException('Domain name missing');
            }
            this._domain = JID._checkNodeName(new_domain);
        },
        get resource(){
            return this._resource;
        },
        set resource(new_resource){
            this._resource = new_resource;
        },
        get bare(){
            return this.node + '@' + this.domain;
        }
    }

    JID.prototype.toString = function(){
        var jid = '';
        if (this.node)
            jid = this.node + '@';
        jid += this.domain;
        if (this.resource)
            jid += '/' + this.resource;
        return jid;
    };

    JID.prototype.clone = function(bare){
        if(bare){
            return new JID(this.bare);
        }
        return new JID(this.toString());
    };

    JID.prototype.isEntity = function(jid){
        var jid =  jid instanceof JID ? jid.clone(true) : new JID(jid).clone(true),
            clone = this.clone(true);
        return (clone.toString() === jid.toString());
    };

    JID.prototype.escape = function(node, domain, resource){
        var escapeNode = '';
        for (var i = 0; i < node.length; i++)
            if (JID_FORBIDDEN.indexOf(node[i]) != -1)
                escapeNode += '\\' + codesForEscape[node[i]];
        else{
            //if situation like c:\5ccommon
            if (i < node.length - 2 && node[i] == '\\'){
                var code = node.slice(i + 1, i + 3);
                var key = codesForUnescape[code];
                if (key){
                    escapeNode += '\\' + codesForEscape[key];
                }else
                    escapeNode += node[i];
            }else
                escapeNode += node[i];
        }
        return new JID({
            node: escapeNode,
            domain: domain,
            resource: resource
        });
    };

    JID.prototype.unescape = function(){
        var resultJID = '',
            node = this.node;
        for(var i=0; i < node.length; i++){
            if (JID_FORBIDDEN.indexOf(node[i]) != -1 && node[i] != '\\')
                throw new JIDInvalidException("forbidden char in escape nodename: " + JID_FORBIDDEN[i]);
            if (node[i] == '\\'){
                var code = node.slice(i + 1, i + 3);
                var key = codesForUnescape[code];
                if (key){
                    if (key == ' ' && (i == 0 || i == node.length - 3))
                        throw new JIDInvalidException("wrong unescape: space at the beginning or at the end");
                    resultJID += key;
                    i += 2;
                }else
                    resultJID += node[i];
            }else
                resultJID += node[i];
        }
        resultJID += '@' + this.domain;
        if (this.resource)
            resultJID += '/' + this.resource;
        return resultJID;
    };

    JID._checkNodeName = function(nodeprep){
        if (!nodeprep || nodeprep == '')
            return;
        for (var i=0; i< JID_FORBIDDEN.length; i++)
            if (nodeprep.indexOf(JID_FORBIDDEN[i]) != -1)
                throw new JIDInvalidException("forbidden char in nodename: " + JID_FORBIDDEN[i]);
        return nodeprep;
    };

    return JID;

});