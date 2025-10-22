// chatbot.js
// Beebot - conversación simulada para onboarding.
// Provee window.BeebotCore.init({ containerMessages, containerOptions, inputEl, sendBtn, openModalHelp, links })

(function(){
  'use strict';

  // Utilidades internas
  function el(tag, attrs, children){
    const n = document.createElement(tag);
    if(attrs){
      Object.keys(attrs).forEach(k=>{
        if(k === 'class') n.className = attrs[k];
        else if(k === 'text') n.textContent = attrs[k];
        else if(k === 'html') n.innerHTML = attrs[k];
        else n.setAttribute(k, attrs[k]);
      });
    }
    if(children && children.length) children.forEach(c=> n.appendChild(c));
    return n;
  }

  // Simple queue for message simulation
  function sleep(ms){ return new Promise(resolve=> setTimeout(resolve, ms)); }

  const defaultTree = {
    start: {
      text: "¡Hola! Soy Beebot 🤖. ¿En qué te gustaría que te ayude hoy?",
      options: [
        { id: 'create_account', label: 'Crear cuenta (guía paso a paso)' },
        { id: 'rules', label: 'Reglas y buenas prácticas' },
        { id: 'tips', label: 'Tips para crecer en Hive' },
        { id: 'videos', label: 'Ver videos explicativos' },
      ]
    },
    create_account: {
      text: "Genial — te guiaré en unos pasos simples. ¿Quieres que te conecte con un asistente humano en grupo o prefieres instrucciones aquí?",
      options: [
        { id: 'create_here', label: 'Instrucciones aquí' },
        { id: 'connect_group', label: 'Conectarme al grupo (WhatsApp)' }
      ]
    },
    create_here: {
      text: "Paso 1: Ve a signup.hive.io (te dejo el enlace). Paso 2: Escoge un nombre de usuario único. Paso 3: Guarda tus claves con seguridad. ¿Quieres que te muestre recursos rápidos sobre seguridad?",
      options: [
        { id: 'security', label: 'Sí, seguridad' },
        { id: 'no_more', label: 'Listo, gracias' }
      ]
    },
    connect_group: {
      text: "Abro el enlace de WhatsApp para que un asistente te ayude en vivo.",
      action: "open_whatsapp"
    },
    security: {
      text: "Consejo rápido: usa una contraseña fuerte, habilita 2FA donde sea posible, guarda tus claves fuera de la nube. También puedes solicitar soporte en el grupo si tienes dudas.",
      options: [
        { id: 'open_help_modal', label: 'Quiero ayuda paso a paso' },
        { id: 'back', label: 'Volver' }
      ]
    },
    rules: {
      text: "Reglas básicas: (1) Respeto y cordialidad, (2) No spam ni autopromoción excesiva, (3) Cita fuentes y da crédito, (4) Sigue las normas de las comunidades. ¿Te muestro ejemplos prácticos?",
      options: [
        { id: 'examples', label: 'Sí, ejemplos' },
        { id: 'back', label: 'Volver' }
      ]
    },
    tips: {
      text: "Tips para crecer: publica con constancia, usa etiquetas relevantes, participa en comunidades, interactúa con otros creadores, y optimiza tus títulos/miniaturas.",
      options: [
        { id: 'tips_more', label: 'Dame un checklist' },
        { id: 'back', label: 'Volver' }
      ]
    },
    videos: {
      text: "Aquí tienes algunos recursos en video. ¿Quieres ver un video corto (1-2 min) explicando Hive?",
      options: [
        { id: 'video_short', label: 'Sí, ver (YouTube)' },
        { id: 'video_3speak', label: 'Ver en 3Speak' },
        { id: 'back', label: 'Volver' }
      ]
    },
    video_short: {
      text: "Abriendo un video de introducción en YouTube.",
      action: "open_youtube",
    },
    video_3speak: {
      text: "Abriendo contenido en 3Speak.",
      action: "open_3speak",
    },
    examples: {
      text: "Ejemplo de buena práctica: post bien formateado, título claro, imagen de portada, tags relevantes. Evita mensajes cortos sin contexto.",
      options: [
        { id: 'back', label: 'Volver' }
      ]
    },
    tips_more: {
      text: "Checklist: 1) Publica 2 veces por semana; 2) Participa en 3 comunidades; 3) Comenta en contenido similar; 4) Revisa métricas semanalmente.",
      options: [
        { id: 'back', label: 'Volver' }
      ]
    },
    open_youtube: {
      text: "Abriendo YouTube...",
      action: "open_youtube"
    },
    open_3speak: {
      text: "Abriendo 3Speak...",
      action: "open_3speak"
    },
    back: {
      text: "¿En qué más puedo ayudarte?",
      options: [
        { id: 'create_account', label: 'Crear cuenta' },
        { id: 'rules', label: 'Reglas' },
        { id: 'tips', label: 'Tips' },
        { id: 'videos', label: 'Videos' }
      ]
    },
    no_more: {
      text: "Perfecto. Si necesitas algo más, pulsa una opción o escríbeme. ¡Éxitos en Hive!",
      options: [
        { id: 'back', label: 'Volver' }
      ]
    },
    open_help_modal: {
      text: "Abriendo modal de ayuda...",
      action: "open_modal_help"
    }
  };

  // Constructor/namespace expuesto
  const BeebotCore = {
    init: function(opts){
      // opts: { containerMessages, containerOptions, inputEl, sendBtn, openModalHelp, links }
      if(!opts || !opts.containerMessages) {
        console.error('BeebotCore.init requiere containerMessages');
        return;
      }

      const containers = {
        messages: opts.containerMessages,
        options: opts.containerOptions,
        input: opts.inputEl,
        sendBtn: opts.sendBtn
      };

      const links = opts.links || { whatsapp:'#', telegram:'#', hiveEco:'https://hive.io/eco' };
      const openModalHelp = typeof opts.openModalHelp === 'function' ? opts.openModalHelp : ()=>{};

      // internal state
      let currentNode = 'start';
      let isProcessing = false;

      // render helpers
      function scrollToBottom(){
        try{ containers.messages.scrollTop = containers.messages.scrollHeight; }catch(e){}
      }

      function appendAgentMessage(text, delay=600){
        const msg = el('div', { class: 'msg agent' });
        msg.textContent = '...'; // placeholder
        containers.messages.appendChild(msg);
        scrollToBottom();
        // simulate typing
        return sleep(delay).then(()=>{
          msg.textContent = text;
          scrollToBottom();
          return msg;
        });
      }

      function appendUserMessage(text){
        const msg = el('div', { class: 'msg user' });
        msg.textContent = text;
        containers.messages.appendChild(msg);
        scrollToBottom();
        return msg;
      }

      function clearOptions(){
        if(!containers.options) return;
        containers.options.innerHTML = '';
      }

      function renderOptions(list){
        if(!containers.options) return;
        containers.options.innerHTML = '';
        list.forEach(opt=>{
          const btn = el('button', { class: 'option-chip', 'data-opt': opt.id, 'type':'button' });
          btn.textContent = opt.label;
          btn.addEventListener('click', ()=> handleOption(opt.id));
          containers.options.appendChild(btn);
        });
      }

      async function handleOption(optionId){
        if(isProcessing) return;
        isProcessing = true;
        // show user selection
        appendUserMessage(getLabelForOption(optionId) || optionId);
        await sleep(320);
        await processNode(optionId);
        isProcessing = false;
      }

      function getLabelForOption(optionId){
        // search node options for label
        for(const k in defaultTree){
          const node = defaultTree[k];
          if(node && node.options){
            const found = node.options.find(o=> o.id === optionId);
            if(found) return found.label;
          }
        }
        return null;
      }

      async function processNode(nodeId){
        // if node exists, show node text
        const node = defaultTree[nodeId] || defaultTree['back'];
        currentNode = nodeId;
        if(node.text){
          await appendAgentMessage(node.text, 450 + Math.min(800, node.text.length*6));
        }
        // handle action alt
        if(node.action){
          await handleAction(node.action);
        }
        if(node.options && node.options.length){
          renderOptions(node.options);
        } else {
          // default: show main options (back)
          renderOptions(defaultTree['start'].options);
        }
      }

      async function handleAction(action){
        if(action === 'open_whatsapp'){
          const url = links.whatsapp || '#';
          window.open(url,'_blank');
          await appendAgentMessage('He abierto el enlace de WhatsApp. Si no se abre, revisa tus permisos o únete manualmente: ' + url, 600);
        } else if(action === 'open_youtube'){
          // example youtube id - you can replace if desired
          const youtubeUrl = 'https://www.youtube.com/watch?v=VIDEO_YOUTUBE_ID';
          window.open(youtubeUrl, '_blank');
          await appendAgentMessage('He abierto un video de introducción en YouTube.', 500);
        } else if(action === 'open_3speak'){
          // sample 3speak link
          const url = 'https://3speak.tv';
          window.open(url, '_blank');
          await appendAgentMessage('He abierto un recurso en 3Speak.', 500);
        } else if(action === 'open_modal_help'){
          openModalHelp();
          await appendAgentMessage('He abierto el panel de ayuda. Allí puedes unirte a un asistente humano.', 500);
        } else {
          // unknown action
          await appendAgentMessage('Acción no reconocida: ' + action, 300);
        }
      }

      // input handling
      if(containers.sendBtn && containers.input){
        containers.sendBtn.addEventListener('click', ()=>{
          const v = (containers.input.value||'').trim();
          if(!v) return;
          appendUserMessage(v);
          containers.input.value = '';
          // very simple naive parsing: check keywords
          handleUserText(v);
        });
        containers.input.addEventListener('keydown', (e)=>{
          if(e.key === 'Enter' && !e.shiftKey){
            e.preventDefault();
            containers.sendBtn.click();
          }
        });
      }

      async function handleUserText(text){
        const t = text.toLowerCase();
        if(t.includes('crear') || t.includes('cuenta') || t.includes('registro')){
          await processNode('create_account');
        } else if(t.includes('regla') || t.includes('norma') || t.includes('práctica')){
          await processNode('rules');
        } else if(t.includes('consejo') || t.includes('tips') || t.includes('crecer')){
          await processNode('tips');
        } else if(t.includes('video') || t.includes('ver')){
          await processNode('videos');
        } else if(t.includes('whatsapp')){
          await handleAction('open_whatsapp');
        } else {
          // fallback
          await appendAgentMessage("Buena pregunta — aún estoy aprendiendo. Mientras tanto, ¿quieres ver opciones rápidas?", 500);
          renderOptions(defaultTree.start.options);
        }
      }

      // Initialize: show start node content (small delay)
      (async function(){
        clearOptions();
        await sleep(230);
        await processNode('start');
      })();

      // expose a small API to send programmatic messages if needed
      return {
        sendSystemMessage: function(text){
          appendAgentMessage(text, 200);
        }
      };
    } // end init
  }; // end BeebotCore

  // expose to window
  window.BeebotCore = BeebotCore;

})();
