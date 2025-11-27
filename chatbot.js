// chatbot.js (versión final corregida - comillas y auditado)
// Beebot - conversación simulada para onboarding (ES).
// Uso: window.BeebotCore.init({ containerMessages, containerOptions, inputEl, sendBtn, openModalHelp, links })

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
  function copyToClipboard(text){
    if(!text) return;
    if(navigator.clipboard && navigator.clipboard.writeText){
      return navigator.clipboard.writeText(text).catch(()=> {
        const t = document.createElement('textarea');
        t.value = text; document.body.appendChild(t); t.select();
        try{ document.execCommand('copy'); }catch(e){}
        t.remove();
      });
    } else {
      const t = document.createElement('textarea');
      t.value = text; document.body.appendChild(t); t.select();
      try{ document.execCommand('copy'); }catch(e){}
      t.remove();
    }
  }

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
    hive_games: 'https://hive.io/eco?t=game',
    hive_official: 'https://hive.io',
    signup: 'https://holahive.com/', // usar solo holahive.com según indicación
    whatsapp: '#',
    telegram: '#'
  };

  /* ============================
     ÁRBOL CONVERSACIONAL (estructurado)
     - Mantener menú inicial sencillo.
     - Añadir nodos faltantes y contenido ampliado.
     ============================ */
  const defaultTree = {
    start: {
      text: "¡Hola! Soy **Beebot** 🤖 — tu guía para entrar a Hive. Puedo ayudarte a crear tu cuenta (holahive.com), preparar tu presentación larga (600+ palabras), y acompañarte a publicar paso a paso. ¿Qué te interesa ahora?",
      options: [
        { id:'how_is_hive', label:'¿Qué es Hive?' },
        { id:'create_account', label:'Crear cuenta (ayuda)' },
        { id:'presentation_start', label:'Crear mi presentación' },
        { id:'publish_first', label:'Publicar mi primer post' },
        { id:'resources', label:'Videos y guías' },
        { id:'faq', label:'Preguntas frecuentes' }
      ]
    },

    /* ¿Qué es Hive? - ampliado y cuidadoso en ganancias */
    how_is_hive: {
      text: "Hive es una blockchain y una comunidad para crear y compartir contenido. Aquí las personas publican, participan en comunidades y, si su contenido es original y aporta valor, **existe la posibilidad** de recibir criptomonedas del ecosistema (HIVE y HBD). No es una garantía: la visibilidad y las recompensas dependen de la calidad, la interacción y las normas de la comunidad.\n\nAdemás de recompensas momentáneas, Hive ofrece beneficios a largo plazo para creadores: participar en comunidades de nicho que te interesan, conectar con personas alrededor del mundo, colaborar en proyectos y construir una reputación como creador. ¿Quieres ver beneficios para un perfil en particular?",
      options:[
        { id:'benefits_creators', label:'Para creadores' },
        { id:'benefits_gamers', label:'Para jugadores' },
        { id:'benefits_investors', label:'Para inversores' },
        { id:'back', label:'Volver' }
      ]
    },

    /* Beneficios para creadores: ampliar copy y añadir checklist node */
    benefits_creators: {
      text: "Para creadores: Hive no solo permite monetizar contenido (cuando la comunidad lo valora), sino que también ofrece otras ventajas importantes:\n\n• **Comunidades de nicho:** Encuentra grupos que comparten tus intereses (ej. educación, arte, tecnología, deporte) para hacer crecer una audiencia real.\n• **Conexiones globales:** Colabora y conecta con personas de distintas regiones, descubriendo oportunidades y sinergias.\n• **Visibilidad sostenida:** Participar activamente (comentando y curando) ayuda a construir reputación a largo plazo.\n• **Herramientas creativas:** soporta multimedia, NFTs y economías propias (para proyectos y juegos).\n\n¿Quieres una plantilla para presentarte o un checklist práctico para crecer y planificar tu contenido?",
      options:[
        { id:'template_short', label:'Plantilla reestructurada (subtítulos)' },
        { id:'tips_more', label:'Checklist para crecer (pauta)' },
        { id:'back', label:'Volver' }
      ]
    },

    /* Checklist para crecer - ahora con contenido */
    tips_more: {
      text:
        "Checklist práctico para crecer en Hive (resumen accionable):\n\n1) **Publica con regularidad:** fija un ritmo realista (ej. 1 post semanal) y define un calendario editorial.\n2) **Céntrate en valor:** cada publicación debe responder una pregunta, enseñar algo o compartir una experiencia útil.\n3) **Participa en comunidades de tu nicho:** comenta en posts relevantes y únete a comunidades (spaces) afines.\n4) **Usa etiquetas estratégicas:** elige 3-5 etiquetas relevantes y una etiqueta de introducción (#introduceyourself #hivetalkproject). Evita etiquetas irrelevantes.\n5) **Interacción:** responde comentarios y agradece a quienes te apoyen; la conversación genera visibilidad.\n6) **Portadas y formato:** usa una buena imagen de portada y estructura (título claro, subtítulos, listas). Revisa la guía de Markdown si dudas.\n7) **Evita spam/plagio:** publica original; si citas, referencia la fuente.\n8) **Mide y ajusta:** revisa métricas de vistas y comentarios; ajusta el contenido según lo que funcione.\n\nSi quieres, puedo ayudarte a crear un plan semanal o una publicación ahora mismo.",
      options:[ { id:'plan_week', label:'Ayúdame con un plan semanal' }, { id:'start_post_builder', label:'Crear post ahora' }, { id:'back', label:'Volver' } ]
    },

    /* Juegos: enlazar a hive.io eco con copy persuasivo */
    benefits_gamers: {
      text: "En Hive hay un ecosistema creciente de juegos con economías reales: NFTs, mercados y activos que los jugadores pueden poseer e intercambiar. Esto permite jugar y participar en economías propias sin las fricciones (altas comisiones) de otras redes. ¿Quieres ver el ecosistema de juegos y marketplaces?",
      options:[ { id:'games_more', label:'Ver juegos y ecosistema' }, { id:'back', label:'Volver' } ]
    },
    games_more: {
      text: "Abriendo ecosistema de juegos en Hive... (se abrirá en una nueva pestaña).",
      action: "open_link:hive_games"
    },

    /* Inversores: HBD y HP ampliado (hbd_more) */
    benefits_investors: {
      text: "Información para inversores: Hive ofrece activos como HIVE (token) y HBD (stablecoin interna). Además existe **Hive Power (HP)**: es HIVE bloqueado en stake que otorga influencia en curación y Resource Credits. Antes de participar, infórmate sobre riesgos y la diferencia entre liquidez y stake.",
      options:[ { id:'hbd_more', label:'Más sobre HBD y HP' }, { id:'back', label:'Volver' } ]
    },

    hbd_more: {
      text: "HBD y Hive Power (HP) — explicación simple:\n\n• **HBD (Hive Backed Dollar):** es la stablecoin dentro del ecosistema que busca estabilidad para usos de ahorro y pagos dentro de Hive. Tiene mecanismos internos que intentan mantener su valor.\n• **HIVE:** token principal de la red, con precio fluctuante en mercados.\n• **HP (Hive Power):** es HIVE 'bloqueado' en stake. Al convertir HIVE a HP obtienes mayor influencia en la red (curación/votos) y Resource Credits para operar más sin pagar comisiones. HP no es 100% líquido: para recuperar HIVE se necesita hacer un proceso de 'power down' gradual.\n\nConsejos para inversores principiantes:\n1) Infórmate antes de usar HBD como ahorro.\n2) Considera el horizonte: convertir HIVE a HP es útil si quieres participar y curar contenido; si necesitas liquidez, mantener HIVE es mejor.\n3) Usa wallets seguras y evita compartir claves. ¿Quieres recursos técnicos y guías oficiales?",
      options:[ { id:'open_hive_eco', label:'Ver docs / Ecosistema' }, { id:'back', label:'Volver' } ]
    },
    open_hive_eco: { text: "Abriendo documentación y ecosistema Hive.", action: "open_link:hive_eco" },

    /* Crear cuenta (flujo) */
    create_account: {
      text: "Te guío paso a paso para crear tu cuenta en holahive.com (solo ese sitio). Te ayudaré con la elección de nombre y la seguridad de claves. ¿Comenzamos?",
      options:[
        { id:'open_signup', label:'Abrir holahive.com' },
        { id:'account_steps', label:'Ver pasos rápidos' },
        { id:'keychain', label:'Usar Hive Keychain (recomendado)' },
        { id:'back', label:'Volver' }
      ]
    },
    open_signup: { text: "Abriendo holahive.com...", action: "open_link:signup" },
    account_steps: { text: "Pasos rápidos para crear tu cuenta:\n1) Entra a holahive.com\n2) Elige un nombre único\n3) Guarda tus claves (apunta en un lugar seguro)\n4) Instala Hive Keychain para manejar claves desde el navegador. ¿Quieres ver la checklist de seguridad?", options:[ { id:'security_checklist', label:'Checklist de seguridad' }, { id:'back', label:'Volver' } ] },

    /* Claves ampliadas y explicación sencilla */
    security_checklist: {
      text:
        "Checklist de seguridad (explicación clara):\n\n• **Tipos de claves:**\n  - *Owner / Master:* la más poderosa. Permite cambiar otras claves. Guárdala offline y no la uses para publicar.\n  - *Active:* para operaciones financieras (transferencias). Manténla segura y no la uses para publicar diariamente.\n  - *Posting:* usada para publicar y comentar. Es la clave que usarás más seguido; es la que puedes usar en aplicaciones públicas con menor riesgo.\n  - *Memo:* para leer/descifrar mensajes privados.\n\n• **Consejos prácticos:**\n  1) Guarda la *owner/master* en un lugar offline (papel físico o dispositivo seguro).\n  2) Usa *posting* para publicar; instala Hive Keychain para firmar desde el navegador sin exponer claves.\n  3) Nunca pegues tus claves en chats ni las compartas con desconocidos.\n  4) Haz copias físicas seguras y anota el orden de palabras si es una frase de recuperación.\n  5) Si sospechas que te robaron una clave, usa la *owner/master* para cambiar las demás claves y recuperar control.\n\nSi quieres, te dejo el tutorial para instalar Hive Keychain.",
      options:[ { id:'keychain_video', label:'Ver tutorial Keychain' }, { id:'keychain_peakd', label:'Guía escrita Keychain' }, { id:'back', label:'Volver' } ]
    },
    keychain: {
      text: "Hive Keychain facilita firmar transacciones desde el navegador sin exponer tus claves. Recomendado para quienes usan PeakD u otras interfaces web.",
      options:[
        { id:'keychain_video', label:'Ver tutorial (video)' },
        { id:'keychain_peakd', label:'Guía escrita (PeakD)' },
        { id:'back', label:'Volver' }
      ]
    },
    keychain_video: { text: "Abriendo tutorial para instalar Keychain en Chrome.", action: "open_link:video_keychain_chrome" },
    keychain_peakd: { text: "Abriendo guía para añadir tu cuenta a Hive Keychain.", action: "open_link:keychain_tutorial" },

    /* Presentaciones (flow interactivo ampliado) */
    presentation_start: {
      text: "¿Quieres que te ayude a construir una presentación larga (600+ palabras) para tu primer post? Te haré preguntas sencillas y generaré el texto listo para pegar en PeakD/Ecency. ¿Comenzamos?",
      options:[
        { id:'presentation_interactive', label:'Sí — Comenzar guía' },
        { id:'template_short', label:'Plantilla reestructurada (subtítulos)' },
        { id:'present_examples', label:'Ejemplos / Guía' },
        { id:'back', label:'Volver' }
      ]
    },

    presentation_interactive: { text: "Abriendo asistente interactivo para la presentación...", action: "start_presentation" },

    /* Plantilla corta reestructurada: subtítulos sugeridos (no es la presentación final de 600 palabras) */
    template_short: {
      text: "Plantilla estructurada — subtítulos para el post de presentación (útil si te piden 600+ palabras):\n\n1) **Quién eres** — breve biografía y contexto (2-3 párrafos).\n2) **A qué te dedicas** — explica tu ocupación o enfoque principal.\n3) **Cómo conociste Hive** — brevemente, el porqué decidiste unirte.\n4) **Hobbies / tiempo libre** — humaniza tu presentación con intereses personales.\n5) **Expectativas en la blockchain de Hive** — qué esperas aprender o compartir.\n6) **Qué te gusta de Hive** — menciona elementos concretos (comunidad, herramientas, posibilidades).\n\nConsejo: desarrolla cada subtítulo en 2-4 párrafos para alcanzar las ~600 palabras. Usa #introduceyourself #hivetalkproject como tags.",
      options:[ { id:'present_examples', label:'Ver ejemplos' }, { id:'back', label:'Volver' } ]
    },

    present_examples: {
      text: "Ejemplo de estructura y guía: desarrolla cada subtítulo con detalles y anécdotas para llegar a 600+ palabras. ¿Quieres que te guíe ahora con preguntas para generar la presentación completa?",
      options:[ { id:'presentation_interactive', label:'Sí — Comenzar guía' }, { id:'open_present_guide', label:'Leer guía de presentación' }, { id:'back', label:'Volver' } ]
    },

    open_present_guide: { text: "Abriendo guía de presentación (PeakD).", action: "open_link:presentacion_guide" },
    open_present_video: { text: "Abriendo tutorial de presentación en video.", action: "open_link:video_presentation" },

    /* Publicar primer post: builder simple */
    publish_first: {
      text: "Publicar tu primer post — pasos simples:\n1) Título claro\n2) Introducción breve\n3) Subtítulos para cada sección\n4) 3-5 etiquetas relevantes\n5) Imagen de portada\n¿Te ayudo a estructurarlo ahora o prefieres usar la plantilla de presentación?",
      options:[
        { id:'guide_markdown', label:'Ver guía de Markdown' },
        { id:'publish_help', label:'Construir post ahora' },
        { id:'back', label:'Volver' }
      ]
    },
    guide_markdown: { text: "Abriendo guía de Markdown y formato.", action: "open_link:markdown_guide" },
    publish_help: { text: "Dime si quieres 'plantilla' o escribe el título para empezar.", options:[ { id:'start_post_builder', label:'Construir post ahora' }, { id:'template_short', label:'Usar plantilla' }, { id:'back', label:'Volver' } ] },

    start_post_builder: { text: "Iniciando asistente para construir tu post. Escribe el título o 'plantilla' para usar una base.", options:[ { id:'back', label:'Volver' } ] },

    /* Recursos (guías y videos) */
    resources: {
      text: "Recursos recomendados: guías y videos para principiantes. ¿Qué prefieres?",
      options:[
        { id:'open_guide_aliento', label:'Primeros pasos (Aliento)' },
        { id:'open_guide_victoria', label:'Guía completa (Victoria)' },
        { id:'open_guide_markdown', label:'Guía de Markdown' },
        { id:'videos', label:'Videos y shorts' },
        { id:'back', label:'Volver' }
      ]
    },
    open_guide_aliento: { text: "Abriendo guía Aliento (PeakD).", action: "open_link:guide_aliento" },
    open_guide_victoria: { text: "Abriendo guía completa para nuevos usuarios.", action: "open_link:guide_complete" },
    open_guide_markdown: { text: "Abriendo guía de Markdown / HTML5.", action: "open_link:markdown_guide" },

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

    /* FAQ ampliadas */
    faq: {
      text: "Preguntas frecuentes — elige una:",
      options:[
        { id:'faq_earnings', label:'¿Voy a ganar dinero publicando?' },
        { id:'faq_hbd', label:'¿Qué es HBD?' },
        { id:'faq_cost', label:'¿Cuesta crear cuenta?' },
        { id:'faq_keys', label:'¿Qué son las claves y cómo cuidarlas?' },
        { id:'faq_support', label:'Necesito ayuda humana' },
        { id:'back', label:'Volver' }
      ]
    },

    faq_earnings: { text: "¿Vas a ganar solo por publicar? No necesariamente. En Hive **existe la posibilidad** de obtener HIVE o HBD por contenido original y de calidad que la comunidad valora, pero no es automático. La visibilidad depende de etiquetas, comunidades, curación y frecuencia. Enfócate en aportar valor y construir comunidad.", options:[ { id:'back', label:'Volver' } ] },

    faq_hbd: { text: "HBD es la stablecoin del ecosistema Hive. Busca estabilidad relativa para usos de ahorro o pagos dentro de la red, pero informáte sobre su funcionamiento y riesgos antes de usarla.", options:[ { id:'back', label:'Volver' } ] },

    faq_cost: { text: "Crear una cuenta en holahive.com es gratis. Evita servicios que cobren por crear tu cuenta o digan que te garantizan ganancias.", options:[ { id:'open_signup', label:'Abrir holahive.com' }, { id:'back', label:'Volver' } ] },

    faq_keys: { text: "Las claves en Hive son varios tipos. Guarda la owner/master offline, usa posting para publicar y activa Hive Keychain para mayor seguridad. No compartas claves ni las pegues en chats.", options:[ { id:'security_checklist', label:'Ver cómo cuidarlas' }, { id:'back', label:'Volver' } ] },

    faq_support: { text: "Si necesitas ayuda humana, únete a nuestros grupos de soporte. Recuerda: los administradores legítimos no pedirán dinero por abrir tu cuenta.", options:[ { id:'open_whatsapp', label:'Unirme por WhatsApp' }, { id:'open_telegram', label:'Unirme por Telegram' }, { id:'back', label:'Volver' } ] },

    open_whatsapp: { text: "Abriendo WhatsApp...", action: "open_whatsapp" },
    open_telegram: { text: "Abriendo Telegram...", action: "open_telegram" },

    /* back and clear */
    back: { text: "¿En qué más puedo ayudarte?", options:[ { id:'start', label:'Menú principal' } ] },
    clear_chat: { text: "Limpiando el chat... (la conversación local se reiniciará)", action: "clear_chat" }
  };

  /* ===========================
     CORE: BeebotCore (expuesto en window)
     - flows: presentation interactive ampliado
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

      // Pending flow state (for interactive features)
      let pending = null;
      let pendingData = {};

      function scrollToBottom(){
        try{ containers.messages.scrollTop = containers.messages.scrollHeight; }catch(e){}
      }

      function createMsgNode(kind, textHTML){
        const m = el('div', { class: 'msg ' + kind });
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
        containers.options && (containers.options.innerHTML = '');
        messageCount = 0;
        pending = null;
        pendingData = {};
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
          'open_signup': 'Abrir holahive.com'
        };
        return fallback[optionId] || optionId;
      }

      /* =======================
         Presentation interactive flow (ampliado)
         Steps collected:
         1) name
         2) what do you do (niche)
         3) main topic
         4) how discovered Hive
         5) hobbies / free time
         6) expectations
         7) what they like most (optional)
         Then generate full ~600+ word presentation.
         ======================= */

      async function startPresentationFlow(){
        pending = 'presentation';
        pendingData = { step: 1, collected: {} };
        await appendAgentMessage("Perfecto — empecemos. Responde con frases simples. ¿Cuál es tu nombre (o cómo te gustaría que te nombren en la presentación)?");
        if(containers.options) renderOptions([{ id:'cancel_pending', label:'Cancelar' }]);
      }

      function _safeText(s){
        return String(s || '').trim();
      }

      function _generateLongPresentation(data){
        const name = _safeText(data.name) || 'Tu nombre';
        const niche = _safeText(data.niche) || 'tu área o tema principal';
        const topic = _safeText(data.topic) || 'temas que compartirás';
        const discovered = _safeText(data.discovered) || 'cómo descubriste Hive';
        const hobbies = _safeText(data.hobbies) || 'tus hobbies o intereses';
        const expectations = _safeText(data.expectations) || 'lo que esperas en Hive';
        const likeMost = _safeText(data.likeMost) || 'lo que más te motiva de Hive';

        const paragraphs = [];

        paragraphs.push(`**Quién soy**\nHola, soy ${name}. A través de mi trabajo y mis experiencias he aprendido a valorar compartir conocimiento y conectar con personas que tienen intereses similares. Vengo de un entorno donde valorar la práctica y la constancia es importante, y por eso decidí empezar a crear contenido: para documentar aprendizajes, ayudar a otros y construir un portafolio de ideas y proyectos. En este espacio quiero presentarme con claridad y ofrecer un panorama honesto sobre mis motivaciones, habilidades y metas.`);

        paragraphs.push(`**A qué me dedico**\nMe dedico a ${niche}. Mi trabajo/iniciativa consiste en generar soluciones y contenidos prácticos que ayuden a otras personas a resolver problemas o mejorar procesos. A lo largo de mi trayectoria he desarrollado actividades relacionadas con ${niche}, creando materiales, ejemplos y pasos concretos que pueden ser replicados por la audiencia. Esta experiencia me permite compartir desde un enfoque práctico y cercano, con ejemplos aplicables en la vida diaria o profesional.`);

        paragraphs.push(`**Cómo conocí Hive**\nConocí Hive mientras buscaba plataformas que recompensaran el contenido original y permitieran una interacción abierta con comunidades. Al investigar, me llamó la atención que Hive combine redes sociales, economía y herramientas para desarrolladores en un solo ecosistema. Decidí unirme porque quería experimentar publicar en un entorno donde el contenido de calidad puede encontrar visibilidad y participar en comunidades que valoran la colaboración.`);

        paragraphs.push(`**Hobbies y tiempo libre**\nEn mi tiempo libre disfruto ${hobbies}. Creo que mostrar lo que hacemos fuera del trabajo ayuda a humanizar nuestras publicaciones y a crear puntos de conexión con la audiencia. En mis publicaciones compartiré tanto temas técnicos como anécdotas personales y ejercicios prácticos que espero resulten útiles y entretenidos.`);

        paragraphs.push(`**Expectativas en Hive**\nMi expectativa al unirme a Hive es aprender y aportar. Busco conectar con personas que compartan intereses similares, recibir retroalimentación sobre lo que publico y colaborar en proyectos concretos. También me interesa descubrir oportunidades para aplicar lo que produzco de forma que otros se beneficien y podamos crecer en comunidad. Entiendo que el crecimiento es gradual y que la consistencia y la calidad son claves.`);

        paragraphs.push(`**Qué me gusta de Hive**\nLo que más valoro de Hive es su mezcla entre comunidad y libertad creativa. La posibilidad de participar en nichos concretos, de experimentar con formatos multimedia y de interactuar directamente con otras personas hace que la plataforma sea un lugar ideal para quienes desean construir una voz propia. Además, las herramientas que permiten integrar economía (como HBD, HP y NFTs) ofrecen alternativas interesantes para quienes quieren explorar formas sostenibles de apoyar la creación de contenido.`);

        paragraphs.push(`**Cierre y llamado a la interacción**\nSi llegaste hasta aquí, gracias por leer. En mis próximas publicaciones compartiré contenido enfocado en ${topic}, con ejemplos prácticos, listas de verificación y pasos claros para que puedas replicar lo que explico. Me encantaría recibir tu feedback: ¿qué temas te gustaría que aborde primero? Puedes comentar, sugerir o invitarme a colaborar. ¡Nos vemos en los comentarios!`);

        return paragraphs.join('\n\n');
      }

      async function finishPresentationFlow(){
        const collected = pendingData.collected || {};
        const presentation = _generateLongPresentation(collected);

        await appendAgentMessage("Listo — he generado una presentación completa (600+ palabras aprox.). Puedes copiarla y pegarla en PeakD o Ecency. Te recomiendo revisar las etiquetas: #introduceyourself #hivetalkproject.");
        await appendAgentMessage(presentation);
        if(containers.options){
          renderOptions([
            { id:'copy_presentation', label:'Copiar presentación' },
            { id:'refine_presentation', label:'Hacer ajustes (tono)' },
            { id:'start_post_builder', label:'Crear post ahora' },
            { id:'start', label:'Menú principal' }
          ]);
        }
        console.log('Beebot:event','presentation_generated',{ collected: pendingData.collected });
        pending = null;
        pendingData = {};
      }

      async function cancelPending(){
        pending = null;
        pendingData = {};
        await appendAgentMessage('He cancelado el asistente interactivo. Volviendo al menú principal.');
        await processNode('start', { autoOpen: false });
      }

      /* =========================
         handleOption: click handlers
         ========================= */
      async function handleOption(optionId){
        if(isProcessing) return;
        isProcessing = true;

        if(optionId === 'cancel_pending'){
          await appendUserMessage('Cancelar');
          await cancelPending();
          isProcessing = false;
          return;
        }

        if(pending === 'presentation'){
          if(optionId === 'copy_presentation'){
            const agents = containers.messages.querySelectorAll('.msg.agent');
            let lastPresentation = '';
            if(agents && agents.length){
              for(let i = agents.length -1; i >=0; i--){
                const t = agents[i].innerText || '';
                if(t.toLowerCase().includes('**quién soy**') || t.toLowerCase().includes('quién soy')){
                  lastPresentation = agents[i].innerText;
                  break;
                }
              }
            }
            if(!lastPresentation){
              lastPresentation = _generateLongPresentation(pendingData.collected || {});
            }
            copyToClipboard(lastPresentation);
            await appendUserMessage('Copiar presentación');
            await appendAgentMessage('Presentación copiada al portapapeles. Pégala en PeakD o Ecency para publicar.');
            isProcessing = false;
            return;
          }
          if(optionId === 'refine_presentation'){
            await appendUserMessage('Refinar presentación');
            await appendAgentMessage('¿Qué tono prefieres? (responde: "formal", "más breve", "más amigable")');
            renderOptions([{ id:'cancel_pending', label:'Cancelar' }]);
            isProcessing = false;
            return;
          }
        }

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
            const url = links[key] || '#';
            safeOpen(url);
          } else if(act === 'start_presentation'){
            appendUserMessage(findOptionLabel(optionId) || optionId);
            await startPresentationFlow();
            isProcessing = false;
            return;
          } else if(act === 'clear_chat'){
            clearChat();
            isProcessing = false;
            return;
          }
        }

        appendUserMessage(findOptionLabel(optionId) || optionId);
        await sleep(220);
        await processNode(optionId, { autoOpen: true });
        isProcessing = false;
      }

      /* =========================
         processNode: show messages, handle actions, render options
         ========================= */
      async function processNode(nodeId, opts){
        const node = defaultTree[nodeId] || defaultTree['start'];
        currentNode = nodeId;
        opts = opts || { autoOpen: false };

        if(node.text){
          await appendAgentMessage(node.text);
        }

        if(node.action){
          await handleAction(node.action, { autoOpen: !!opts.autoOpen });
        }

        if(node.options && node.options.length){
          renderOptions(node.options);
        } else {
          renderOptions(defaultTree.start.options);
        }
      }

      /* =========================
         handleAction: open links etc.
         ========================= */
      async function handleAction(action, opts){
        opts = opts || { autoOpen: false };

        if(action === 'open_whatsapp'){
          const url = links.whatsapp || '#';
          await appendAgentMessage(`<a href="${url}" target="_blank" rel="noopener">Abrir grupo de WhatsApp</a>`);
          if(opts.autoOpen) safeOpen(url);
        } else if(action === 'open_telegram'){
          const url = links.telegram || '#';
          await appendAgentMessage(`<a href="${url}" target="_blank" rel="noopener">Abrir canal de Telegram</a>`);
          if(opts.autoOpen) safeOpen(url);
        } else if(action.startsWith('open_link:')){
          const key = action.split(':')[1];
          let url = '#';
          if(key === 'signup') url = links.signup || DEFAULT_LINKS.signup;
          else url = links[key] || links[key.replace(/-/g,'_')] || '#';
          const label = (key.indexOf('video') !== -1) ? 'Ver video' : 'Abrir enlace';
          await appendAgentMessage(`${label}: <a href="${url}" target="_blank" rel="noopener">${url}</a>`);
          if(opts.autoOpen) safeOpen(url);
        } else if(action === 'start_presentation'){
          await startPresentationFlow();
        } else if(action === 'clear_chat'){
          clearChat();
        } else if(action === 'open_modal_help'){
          openModalHelp();
          await appendAgentMessage('He abierto el panel de ayuda; allí puedes solicitar soporte humano.');
        } else {
          await appendAgentMessage('Acción desconocida: ' + action);
        }
      }

      /* =========================
         Entrada libre: parsing básico y manejo de pending flow
         ========================= */
      async function handleUserText(text){
        const raw = String(text || '').trim();
        const t = raw.toLowerCase();

        if(pending === 'presentation'){
          if(pendingData.step === 1){
            pendingData.collected.name = raw;
            pendingData.step = 2;
            await appendAgentMessage("Perfecto. ¿A qué te dedicas o cuál es tu enfoque principal? (ej. educación, creación, servicios, proyectos personales)");
            if(containers.options) renderOptions([{ id:'cancel_pending', label:'Cancelar' }]);
            return;
          } else if(pendingData.step === 2){
            pendingData.collected.niche = raw;
            pendingData.step = 3;
            await appendAgentMessage("Excelente. ¿Cuál será el tema principal o el primer tema que te interesa compartir? (ej. consejos prácticos, guías paso a paso, análisis sencillo)");
            if(containers.options) renderOptions([{ id:'cancel_pending', label:'Cancelar' }]);
            return;
          } else if(pendingData.step === 3){
            pendingData.collected.topic = raw;
            pendingData.step = 4;
            await appendAgentMessage("¿Cómo conociste Hive o por qué decidiste unirte? (puede ser en una frase)");
            if(containers.options) renderOptions([{ id:'cancel_pending', label:'Cancelar' }]);
            return;
          } else if(pendingData.step === 4){
            pendingData.collected.discovered = raw;
            pendingData.step = 5;
            await appendAgentMessage("¿Qué sueles hacer en tu tiempo libre? Menciona hobbies o intereses personales.");
            if(containers.options) renderOptions([{ id:'cancel_pending', label:'Cancelar' }]);
            return;
          } else if(pendingData.step === 5){
            pendingData.collected.hobbies = raw;
            pendingData.step = 6;
            await appendAgentMessage("¿Qué esperas lograr en Hive en los próximos meses (ej. aprender, colaborar, compartir recursos)?");
            if(containers.options) renderOptions([{ id:'cancel_pending', label:'Cancelar' }]);
            return;
          } else if(pendingData.step === 6){
            pendingData.collected.expectations = raw;
            pendingData.step = 7;
            await appendAgentMessage("Por último: ¿qué es lo que más te gusta o te atrajo de Hive? (puedes responder en una frase)");
            if(containers.options) renderOptions([{ id:'cancel_pending', label:'Cancelar' }]);
            return;
          } else if(pendingData.step === 7){
            pendingData.collected.likeMost = raw;
            await finishPresentationFlow();
            return;
          }
        }

        if(/^(crear|registro|signup|cuenta)/.test(t)){
          return processNode('create_account', { autoOpen: false });
        }
        if(/(present(a|ar)|introducci|presentación)/.test(t)){
          return processNode('presentation_start', { autoOpen: false });
        }
        if(/(regla|norma|práctica|plagio|ia|inteligencia)/.test(t)){
          return processNode('faq', { autoOpen: false });
        }
        if(/(video|youtube|ver video|tutorial)/.test(t)){
          return processNode('videos', { autoOpen: false });
        }
        if(/(whatsapp|grupo|telegram)/.test(t)){
          const url = links.whatsapp || '#';
          await appendAgentMessage(`Puedes unirte aquí: <a href="${url}" target="_blank" rel="noopener">${url}</a>`);
          return;
        }
        if(/(limpiar|borrar chat|reset)/.test(t)){
          clearChat();
          return;
        }
        if(/(publicar|post|peakd|ecency)/.test(t)){
          return processNode('publish_first', { autoOpen: false });
        }

        await appendAgentMessage("Buena pregunta — puedo guiarte paso a paso. ¿Quieres ver las opciones rápidas?");
        renderOptions(defaultTree.start.options);
      }

      /* =========================
         Bind input & start
         ========================= */
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
