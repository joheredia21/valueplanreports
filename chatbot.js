// chatbot.js
// Beebot - conversación simulada para onboarding (ES).
// Uso: window.BeebotCore.init({ containerMessages, containerOptions, inputEl, sendBtn, openModalHelp, links })
// Archivo auditado: entrega de enlaces, no duplicate "clear chat", expansión de reglas, auto-open de links cuando procede.

(function(){
  'use strict';

  /* =====================
     UTILIDADES DOM / TIEMPO
     ===================== */
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
  function sleep(ms){ return new Promise(resolve=> setTimeout(resolve, ms)); }
  function safeOpen(url){
    try{ window.open(url, '_blank', 'noopener'); } catch(e){ console.error('Beebot: open failed', e); }
  }
  function isEmptyStr(s){ return !s || String(s).trim().length === 0; }

  /* =========================================
     DEFAULT LINKS (pueden sobrescribirse al init)
     ========================================= */
  const DEFAULT_LINKS = {
    guide_aliento: 'https://peakd.com/hive-110011/@aliento/primeros-pasos-en-hive-publicacion-de-introduccion-y-recomendaciones-basicas',
    guide_complete: 'https://peakd.com/hive-110011/@victoriabsb/hive-blockchain-la-guia-completa-para-nuevos-usuarios',
    keychain_tutorial: 'https://peakd.com/hive-10053/@manuphotos/como-anadir-tu-cuenta-y-claves-a-hive-keychain-tutorial',
    presentacion_guide: 'https://peakd.com/hive-148441/@ylich/how-to-introduceyourself-or-como-hacer-tu-presentacion',
    markdown_guide: 'https://peakd.com/hive-186377/@ilazramusic/te-perdiste-mi-curso-de-markdown-ven-y-lee-este-post-or-guia-de-markdown-y-html5-or',
    video_intro: 'https://www.youtube.com/watch?v=tRQyulhrN60&t=7s',
    video_short: 'https://www.youtube.com/shorts/bRW2HfnI2Vs',
    video_witnesses_short: 'https://www.youtube.com/shorts/JiFJYaktc3o',
    video_keychain_chrome: 'https://www.youtube.com/watch?v=LQEneN-2d1Y',
    video_presentation: 'https://www.youtube.com/watch?v=8OMSvQLQybo',
    video_peakd_publish: 'https://www.youtube.com/watch?v=XQzDjf5K1p4',
    video_masterclass: 'https://www.youtube.com/watch?v=9dlEvvYAQsk',
    hive_eco: 'https://hive.io/eco',
    hive_official: 'https://hive.io',
    whatsapp: '#',
    telegram: '#'
  };

  /* ============================
     ÁRBOL CONVERSACIONAL (estructurado)
     ============================ */
  // Observa que 'create_account' no aparece en el menú principal por decisión tuya.
  const defaultTree = {
    start: {
      text: "¡Hola! Soy **Beebot** 🤖 — tu asistente para empezar en Hive. ¿Qué quieres hacer ahora?",
      options: [
        { id:'how_is_hive', label:'¿Qué es Hive?' },
        { id:'presentation', label:'Hacer mi presentación (plantilla)' },
        { id:'rules', label:'Reglas y buenas prácticas' },
        { id:'audience', label:'Soy: Creador / Jugador / Inversor / Dev' },
        { id:'videos', label:'Ver videos y tutoriales' },
        { id:'resources', label:'Ver guías (posts)' },
        { id:'clear_chat', label:'Limpiar chat' }
      ]
    },

    how_is_hive: {
      text: "Hive es una blockchain orientada a comunidades y creadores: publica, conecta y gana. Es rápida, sin comisiones por transacción y gobernada por su comunidad. ¿Quieres ver beneficios para un perfil en particular?",
      options:[
        { id:'benefits_creators', label:'Para creadores' },
        { id:'benefits_gamers', label:'Para jugadores' },
        { id:'benefits_investors', label:'Para inversores' },
        { id:'back', label:'Volver' }
      ]
    },

    benefits_creators: {
      text: "Creador: publica artículos, fotos y videos. Ganas HIVE/HBD cuando la comunidad valora tu trabajo. Tu nombre de usuario es tu wallet. ¿Quieres una plantilla para presentarte o un checklist para crecer?",
      options:[
        { id:'template_short', label:'Plantilla corta' },
        { id:'tips_more', label:'Checklist para crecer' },
        { id:'back', label:'Volver' }
      ]
    },

    benefits_gamers: {
      text: "Jugador: Hive aloja juegos con economías (assets, NFTs). Las microtransacciones son rápidas y sin comisiones, lo que mejora la experiencia. ¿Quieres ver comunidades de juegos?",
      options:[
        { id:'games_more', label:'Comunidades de juegos' },
        { id:'back', label:'Volver' }
      ]
    },

    benefits_investors: {
      text: "Inversor: HBD es la stablecoin del ecosistema; existen formas de ahorro y utilidades dentro del ecosistema. Investiga riesgos y usa wallets seguras.",
      options:[
        { id:'hbd_more', label:'Más sobre HBD' },
        { id:'back', label:'Volver' }
      ]
    },

    // Crear cuenta sigue existiendo como nodo pero no en el inicio principal:
    create_account: {
      text: "Guía rápida para crear cuenta:\n1) Abre signup.hive.io\n2) Escoge un nombre único\n3) Guarda tus claves con seguridad\n4) Considera usar Hive Keychain para gestionar claves.",
      options:[
        { id:'open_signup', label:'Abrir signup.hive.io' },
        { id:'keychain', label:'Ver tutorial Keychain' },
        { id:'connect_group', label:'Conectarme al grupo (WhatsApp)' },
        { id:'back', label:'Volver' }
      ]
    },

    open_signup: { text: "Abriendo signup.hive.io...", action: "open_link:signup" },

    keychain: {
      text: "Keychain ayuda a firmar transacciones desde tu navegador. Te dejo recursos.",
      options:[
        { id:'keychain_video', label:'Ver tutorial (video)' },
        { id:'keychain_peakd', label:'Guía escrita (PeakD)' },
        { id:'back', label:'Volver' }
      ]
    },

    keychain_video: { text: "Abriendo tutorial para instalar Keychain en Chrome.", action: "open_link:video_keychain_chrome" },
    keychain_peakd: { text: "Abriendo guía para añadir tu cuenta a Hive Keychain.", action: "open_link:keychain_tutorial" },

    connect_group: { text: "Te conectaré al grupo (WhatsApp) para soporte humano gratuito.", action: "open_whatsapp" },

    presentation: {
      text: "¿Quieres una plantilla corta o una detallada para presentarte dentro de Hive?",
      options:[
        { id:'template_short', label:'Plantilla corta' },
        { id:'template_detailed', label:'Plantilla detallada' },
        { id:'present_examples', label:'Ejemplos / Guía' },
        { id:'back', label:'Volver' }
      ]
    },

    template_short: {
      text: "Plantilla rápida:\n\nHola, soy **[Tu nombre]** — creador(a) de **[tu nicho]**. Compartiré contenido sobre **[tema]**. ¡Encantado(a) de conocer esta comunidad! #introduccion",
      options:[ { id:'copy_preset', label:'Cómo publico esto?' }, { id:'back', label:'Volver' } ]
    },

    template_detailed: {
      text: "Plantilla detallada:\nTítulo: Hola, soy [Tu nombre] — Me presento\nCuerpo: (2-3 párrafos) quién eres, qué harás y por qué. Añade portada, 3-5 etiquetas relevantes y pide feedback.\n¿Quieres ver un tutorial en video sobre presentación?",
      options:[ { id:'open_present_video', label:'Ver video de presentación' }, { id:'open_present_guide', label:'Ver guía escrita' }, { id:'back', label:'Volver' } ]
    },

    copy_preset: {
      text: "Para publicar: usa PeakD o Ecency, pega el texto, añade una portada y etiquetas. ¿Quieres el tutorial para publicar desde PeakD (video)?",
      options:[ { id:'open_peakd_video', label:'Sí, tutorial PeakD' }, { id:'back', label:'Volver' } ]
    },

    open_peakd_video: { text: "Abriendo tutorial para publicar desde PeakD (video).", action: "open_link:video_peakd_publish" },

    present_examples: {
      text: "Ejemplos: posts bien formateados tienen título claro, introducción, cuerpo con subtítulos y una conclusión. Evita posts sin contenido útil.",
      options:[
        { id:'open_present_guide', label:'Leer guía de presentación' },
        { id:'open_present_video', label:'Ver tutorial de presentación' },
        { id:'back', label:'Volver' }
      ]
    },

    open_present_guide: { text: "Abriendo guía de presentación (PeakD).", action: "open_link:presentacion_guide" },
    open_present_video: { text: "Abriendo tutorial de presentación en video.", action: "open_link:video_presentation" },

    rules: {
      text: "Reglas y buenas prácticas — resumen extendido:\n\n1) **Originalidad**: Publica contenido original. No copies textos enteros de otros autores.\n2) **Plagio y IA**: Si usas IA como ayuda, sé transparente (ej.: “Asistido por IA”); evita publicar contenido generado íntegramente como propio cuando las comunidades lo prohíban.\n3) **Citas**: Si te inspiras en otro autor, cita la fuente (nombre y link) y añade tu aportación personal.\n4) **Respeto y convivencia**: No ataques, no spam, no autopromoción excesiva.\n5) **Calidad**: Cuida formato, imágenes de portada y etiquetas relevantes.\n6) **Seguridad**: Nunca compartas claves privadas; usa extensiones como Hive Keychain.\n\n¿Quieres ejemplos prácticos y un checklist corto?",
      options:[
        { id:'rules_examples', label:'Sí, ejemplos prácticos' },
        { id:'rules_checklist', label:'Checklist corto' },
        { id:'ai_policy', label:'Política sobre IA y plagio (ej.)' },
        { id:'back', label:'Volver' }
      ]
    },

    rules_examples: {
      text: "Ejemplos:\n• Mal: copiar y pegar un artículo sin citar.\n• Bien: resumir la idea, añadir tu opinión, y dejar enlace a la fuente.\n• Cuando uses parte de un texto, pon comillas y referencia.\n\n¿Quieres ver una plantilla para citar?",
      options:[ { id:'how_cite', label:'Mostrar plantilla de cita' }, { id:'back', label:'Volver' } ]
    },

    how_cite: {
      text: "Plantilla de cita:\n“Basado en el artículo de @autor — [enlace]. Aporto: (tus comentarios/experiencias).”",
      options:[ { id:'back', label:'Volver' } ]
    },

    rules_checklist: {
      text: "Checklist rápido:\n• ¿Es original?\n• ¿Cito mis fuentes si corresponde?\n• ¿La publicación aporta valor propio?\n• ¿Las imágenes son de mi autoría o con licencia?\n• ¿No estoy spameando enlaces repetidamente?\n\nSi respondiste sí a todo, ¡estás listo para publicar!",
      options:[ { id:'back', label:'Volver' } ]
    },

    ai_policy: {
      text: "Política de uso de IA — recomendación práctica:\n• Si usas IA para generar ideas o borradores, edita y añade tu valor.\n• Indica claramente el uso de IA: “Este post fue asistido/ayudado por IA; mi aporte: ...”.\n• Algunas comunidades piden 100% contenido humano: respeta reglas específicas de cada comunidad.",
      options:[ { id:'back', label:'Volver' } ]
    },

    audience: {
      text: "Selecciona tu perfil:",
      options:[
        { id:'profile_creator', label:'Creador de contenido' },
        { id:'profile_player', label:'Jugador' },
        { id:'profile_investor', label:'Inversor / Ahorrista' },
        { id:'profile_dev', label:'Desarrollador' },
        { id:'back', label:'Volver' }
      ]
    },

    profile_creator: { text: "Creador: publica con regularidad, usa comunidades y responde comentarios. ¿Quieres plantillas o checklist?", options:[ { id:'template_short', label:'Plantillas' }, { id:'tips_more', label:'Checklist para crecer' }, { id:'back', label:'Volver' } ] },
    profile_player: { text: "Jugador: explora juegos y marketplaces. Busca comunidades de tu juego favorito.", options:[ { id:'games_more', label:'Comunidades' }, { id:'back', label:'Volver' } ] },
    profile_investor: { text: "Inversor: infórmate sobre HBD y riesgos, usa wallets seguras.", options:[ { id:'hbd_more', label:'Más sobre HBD' }, { id:'back', label:'Volver' } ] },
    profile_dev: { text: "Dev: revisa hive.io/eco y la documentación. ¿Quieres enlaces a docs?", options:[ { id:'dev_docs', label:'Enlaces y docs' }, { id:'back', label:'Volver' } ] },
    dev_docs: { text: "Abriendo ecosistema Hive en la web.", action: "open_link:hive_eco" },

    videos: {
      text: "¿Qué video quieres ver?",
      options:[
        { id:'video_intro', label:'Introducción a Hive' },
        { id:'video_masterclass', label:'Masterclass (largo)' },
        { id:'video_short', label:'Shorts rápidos' },
        { id:'back', label:'Volver' }
      ]
    },
    video_intro: { text: "Abriendo video introductorio (YouTube).", action: "open_link:video_intro" },
    video_masterclass: { text: "Abriendo masterclass largo (YouTube).", action: "open_link:video_masterclass" },
    video_short: { text: "Abriendo short explicativo.", action: "open_link:video_short" },

    resources: {
      text: "Guías recomendadas:",
      options:[
        { id:'open_guide_aliento', label:'Primeros pasos (Aliento)' },
        { id:'open_guide_victoria', label:'Guía completa (Victoria)' },
        { id:'open_guide_markdown', label:'Guía de Markdown' },
        { id:'back', label:'Volver' }
      ]
    },
    open_guide_aliento: { text: "Abriendo guía Aliento (PeakD).", action: "open_link:guide_aliento" },
    open_guide_victoria: { text: "Abriendo guía completa para nuevos usuarios.", action: "open_link:guide_complete" },
    open_guide_markdown: { text: "Abriendo guía de Markdown / HTML5.", action: "open_link:markdown_guide" },

    tips_more: { text: "Checklist: 1) Publica 2 veces/semana; 2) Participa en 3 comunidades; 3) Comenta en posts afines; 4) Revisa métricas; 5) Mejora portadas.", options:[ { id:'back', label:'Volver' } ] },
    games_more: { text: "Para juegos, busca Splinterlands y comunidades relacionadas. Usa links de ecosystem para más info.", options:[ { id:'back', label:'Volver' } ] },
    hbd_more: { text: "HBD: stablecoin integrada en Hive. Investiga usos y riesgos antes de usarla.", options:[ { id:'back', label:'Volver' } ] },

    back: { text: "¿En qué más puedo ayudarte?", options:[ { id:'start', label:'Menú principal' } ] },

    clear_chat: { text: "Limpiando el chat... (la conversación local se reiniciará)", action: "clear_chat" }
  };

  /* ===========================
     CORE: BeebotCore (expuesto en window)
     =========================== */
  const BeebotCore = {
    init: function(opts){
      if(!opts || !opts.containerMessages){
        console.error('BeebotCore.init requiere containerMessages');
        return;
      }

      const containers = {
        messages: opts.containerMessages,
        options: opts.containerOptions || null,
        input: opts.inputEl || null,
        sendBtn: opts.sendBtn || null
      };

      const globalCfg = window.__HIVE_SITE_CONFIG || {};
      const links = Object.assign({}, DEFAULT_LINKS, globalCfg, opts.links || {});
      const openModalHelp = typeof opts.openModalHelp === 'function' ? opts.openModalHelp : function(){};

      let currentNode = 'start';
      let isProcessing = false;
      let messageCount = 0;

      function scrollToBottom(){
        try{ containers.messages.scrollTop = containers.messages.scrollHeight; }catch(e){}
      }

      function createMsgNode(kind, textHTML){
        const m = el('div', { class: 'msg ' + kind });
        // innerHTML usage: we sanitize minimal patterns (we assume controlled content)
        m.innerHTML = textHTML;
        return m;
      }

      async function appendAgentMessage(text, delay){
        const placeholder = el('div', { class: 'msg agent' });
        placeholder.textContent = 'Beebot está escribiendo...';
        containers.messages.appendChild(placeholder);
        scrollToBottom();
        const d = typeof delay === 'number' ? delay : Math.min(1200, 350 + Math.max(0, String(text).length * 8));
        await sleep(d);
        // convert markdown-like **bold** to <strong>, newline to <br>, and keep links if already HTML
        let t = String(text).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        t = t.replace(/\n/g, '<br>');
        placeholder.replaceWith(createMsgNode('agent', t));
        scrollToBottom();
        messageCount++;
      }

      function appendUserMessage(text){
        const safe = String(text).replace(/\n/g,'<br>');
        containers.messages.appendChild(createMsgNode('user', safe));
        scrollToBottom();
        messageCount++;
      }

      function clearChat(){
        containers.messages.innerHTML = '';
        messageCount = 0;
        processNode('start', { autoOpen: false }).catch(()=>{});
      }

      function renderOptions(list){
        if(!containers.options) return;
        containers.options.innerHTML = '';
        list.forEach(opt=>{
          const b = el('button',{ class: 'option-chip', type: 'button', 'data-opt': opt.id, 'aria-label': opt.label });
          b.textContent = opt.label;
          b.addEventListener('click', ()=> handleOption(opt.id));
          containers.options.appendChild(b);
        });
        // NOTE: No auto-added "Limpiar chat" to avoid duplicates.
      }

      function findOptionLabel(optionId){
        for(const k in defaultTree){
          if(defaultTree[k] && defaultTree[k].options){
            const found = defaultTree[k].options.find(o=> o.id === optionId);
            if(found) return found.label;
          }
        }
        const fallback = {
          'open_whatsapp': 'Abrir WhatsApp',
          'open_telegram': 'Abrir Telegram',
          'open_signup': 'Abrir signup.hive.io'
        };
        return fallback[optionId] || optionId;
      }

      // handleOption: invoked by user click -> allow immediate window.open for link actions
      async function handleOption(optionId){
        if(isProcessing) return;
        isProcessing = true;

        // if option maps to node with an immediate action that opens links, do immediate open so it's considered user gesture
        const mappedNode = defaultTree[optionId];
        if(mappedNode && mappedNode.action){
          const act = mappedNode.action;
          if(act === 'open_whatsapp'){
            const url = links.whatsapp || '#';
            safeOpen(url);
          } else if(act === 'open_telegram'){
            const url = links.telegram || '#';
            safeOpen(url);
          } else if(act.startsWith('open_link:')){
            const key = act.split(':')[1];
            // some action keys used (video_presentation etc.)
            const url = links[key] || '#';
            // open immediately (user click)
            safeOpen(url);
          } else if(act === 'clear_chat'){
            // clear immediately
            clearChat();
            isProcessing = false;
            return;
          }
        }

        // show user selection
        appendUserMessage(findOptionLabel(optionId) || optionId);
        await sleep(240);
        await processNode(optionId, { autoOpen: true });
        isProcessing = false;
      }

      // processNode: show node text, handle action, render options
      async function processNode(nodeId, opts){
        const node = defaultTree[nodeId] || defaultTree['start'];
        currentNode = nodeId;
        opts = opts || { autoOpen: false };

        if(node.text){
          // provide links inline for certain nodes: if node has action open_link, we will still show text
          await appendAgentMessage(node.text);
        }

        // action
        if(node.action){
          await handleAction(node.action, { autoOpen: !!opts.autoOpen });
        }

        // options or fallback to start options
        if(node.options && node.options.length){
          renderOptions(node.options);
        } else {
          renderOptions(defaultTree.start.options);
        }
      }

      // handleAction: open links or append link message; if autoOpen true, we assume this was from a click handler
      async function handleAction(action, opts){
        opts = opts || { autoOpen: false };

        if(action === 'open_whatsapp'){
          const url = links.whatsapp || '#';
          // append clickable message
          await appendAgentMessage(`<a href="${url}" target="_blank" rel="noopener">Abrir grupo de WhatsApp</a>`);
          // if allowed, open (handled earlier in handleOption for clicks), but attempt if autoOpen true
          if(opts.autoOpen) safeOpen(url);
        } else if(action === 'open_telegram'){
          const url = links.telegram || '#';
          await appendAgentMessage(`<a href="${url}" target="_blank" rel="noopener">Abrir canal de Telegram</a>`);
          if(opts.autoOpen) safeOpen(url);
        } else if(action.startsWith('open_link:')){
          const key = action.split(':')[1];
          // translate specific keys: 'signup' maps to 'https://signup.hive.io' (not in DEFAULT_LINKS by key)
          let url = '#';
          if(key === 'signup') url = 'https://signup.hive.io';
          else url = links[key] || links[key.replace(/-/g,'_')] || '#';
          // show clickable link in chat
          const label = (key.indexOf('video') !== -1) ? 'Ver video' : 'Abrir enlace';
          await appendAgentMessage(`${label}: <a href="${url}" target="_blank" rel="noopener">${url}</a>`);
          // if autoOpen (click), try to open too (may already have been opened)
          if(opts.autoOpen) safeOpen(url);
        } else if(action === 'clear_chat'){
          clearChat();
        } else if(action === 'open_modal_help'){
          openModalHelp();
          await appendAgentMessage('He abierto el panel de ayuda; allí puedes solicitar soporte humano.');
        } else {
          await appendAgentMessage('Acción desconocida: ' + action);
        }
      }

      /* ===========================
         Entrada libre: parsing básico
         =========================== */
      async function handleUserText(text){
        const t = String(text).toLowerCase();
        if(/(crear|registro|signup|cuenta)/.test(t)){
          // user typed "crear cuenta" -> show create_account node but DON'T auto-open signup (no direct click)
          return processNode('create_account', { autoOpen: false });
        }
        if(/(present(a|ar)|introducci|presentación)/.test(t)){
          return processNode('presentation', { autoOpen: false });
        }
        if(/(regla|norma|práctica|plagio|ia|inteligencia)/.test(t)){
          return processNode('rules', { autoOpen: false });
        }
        if(/(video|youtube|ver video|tutorial)/.test(t)){
          return processNode('videos', { autoOpen: false });
        }
        if(/(whatsapp|grupo|telegram)/.test(t)){
          // give link rather than trying to open (no direct click)
          const url = links.whatsapp || '#';
          await appendAgentMessage(`Puedes unirte aquí: <a href="${url}" target="_blank" rel="noopener">${url}</a>`);
          return;
        }
        if(/(limpiar|borrar chat|reset)/.test(t)){
          clearChat();
          return;
        }
        // fallback
        await appendAgentMessage("Buena pregunta — puedo ayudarte con pasos guiados. ¿Quieres ver opciones rápidas?");
        renderOptions(defaultTree.start.options);
      }

      /* ===========================
         Bind input & start
         =========================== */
      if(containers.input && containers.sendBtn){
        containers.sendBtn.addEventListener('click', ()=>{
          const v = (containers.input.value || '').trim();
          if(isEmptyStr(v)) return;
          appendUserMessage(v);
          containers.input.value = '';
          handleUserText(v).catch(e=> console.error(e));
        });
        containers.input.addEventListener('keydown', (e)=>{
          if(e.key === 'Enter' && !e.shiftKey){
            e.preventDefault();
            containers.sendBtn.click();
          }
        });
      }

      // initial greeting
      (async function start(){
        containers.messages.innerHTML = '';
        await sleep(180);
        await processNode('start', { autoOpen: false });
      })();

      // API
      return {
        sendSystemMessage: function(text){
          appendAgentMessage(text, 200).catch(()=>{});
        },
        clearChat: function(){
          clearChat();
        }
      };
    } // init
  }; // BeebotCore

  // publish single global
  window.BeebotCore = BeebotCore;

})(); 
