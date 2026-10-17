// The guides: one public page per thing people search for (the coach, comparing laps, braking points, the racing
// line, the iRating, the shift beep, telemetry on the phone, free telemetry), in English, Spanish and Portuguese, each
// naming the other two. Plain words about what Pitlane HQ really does, never hype; seo.js draws them.

export const TOPICS = [
  {
    id: "coach",
    en: {
      path: "/iracing-coach", title: "iRacing coach: where you lose time, corner by corner · Pitlane HQ",
      desc: "A free iRacing driving coach: Pitlane HQ compares your lap with real faster laps and tells you which corners cost the most and what to change.",
      h1: "An iRacing coach that uses real laps",
      lead: "Pitlane HQ compares your lap with a faster lap driven by a real person on the same car and track, and tells you, corner by corner, where the time goes and what to change first.",
      secs: [
        ["The corners that cost the most", "Every corner of the lap is measured against the reference: where you brake, how fast you reach the apex and when you pick up the throttle. The coach lists the corners that lose the most time first."],
        ["A tip that follows the data", "Brake later or earlier, carry more speed to the apex, pick up the throttle sooner, take a different line or gear: each tip comes from what your lap and the faster one really did."],
        ["Real references, not an ideal lap", "The reference is a real lap: the record of the car and track, or the lap of the driver just ahead of your pace. Nothing is made up from pieces of different laps."],
        ["A plan for the next session", "What to work on first, the habits that repeat over the lap and the map with the corners marked."],
      ],
      faq: [
        ["Is the iRacing coach free?", "Yes. The coach, the telemetry and the overlays of Pitlane HQ are free."],
        ["Where does the faster lap come from?", "From the laps of Pitlane HQ drivers on the same car and track: the fastest lap and the next level above your pace."],
        ["Do I need to set anything up?", "No. Install Pitlane HQ Agent on the PC where you race, drive, and open Analysis → Coach."],
      ],
    },
    es: {
      path: "/es/coach-iracing", title: "Coach de iRacing: dónde pierdes tiempo, curva a curva · Pitlane HQ",
      desc: "Un coach de conducción gratis para iRacing: Pitlane HQ compara tu vuelta con vueltas reales más rápidas y te dice qué curvas te cuestan más y qué cambiar.",
      h1: "Un coach de iRacing con vueltas reales",
      lead: "Pitlane HQ compara tu vuelta con una vuelta más rápida de una persona real en el mismo coche y circuito, y te dice, curva a curva, dónde se va el tiempo y qué cambiar primero.",
      secs: [
        ["Las curvas que más te cuestan", "Cada curva de la vuelta se mide frente a la referencia: dónde frenas, a qué velocidad llegas al vértice y cuándo vuelves a acelerar. El coach pone primero las curvas que más tiempo pierden."],
        ["Un consejo que sigue a los datos", "Frenar más tarde o antes, llevar más velocidad al vértice, acelerar antes, otra trazada u otra marcha: cada consejo sale de lo que hicieron de verdad tu vuelta y la más rápida."],
        ["Referencias reales, no una vuelta ideal", "La referencia es una vuelta real: el récord del coche y circuito, o la vuelta del piloto justo por encima de tu ritmo. Nada se inventa con trozos de vueltas distintas."],
        ["Un plan para la próxima sesión", "Qué trabajar primero, los hábitos que se repiten en la vuelta y el mapa con las curvas marcadas."],
      ],
      faq: [
        ["¿El coach de iRacing es gratis?", "Sí. El coach, la telemetría y los overlays de Pitlane HQ son gratis."],
        ["¿De dónde sale la vuelta más rápida?", "De las vueltas de los pilotos de Pitlane HQ en el mismo coche y circuito: la más rápida y el siguiente nivel por encima de tu ritmo."],
        ["¿Hay que configurar algo?", "No. Instala Pitlane HQ Agent en el PC donde corres, conduce y abre Análisis → Coach."],
      ],
    },
    pt: {
      path: "/pt/coach-iracing", title: "Coach de iRacing: onde você perde tempo, curva a curva · Pitlane HQ",
      desc: "Um coach de pilotagem grátis para iRacing: o Pitlane HQ compara sua volta com voltas reais mais rápidas e diz quais curvas custam mais e o que mudar.",
      h1: "Um coach de iRacing com voltas reais",
      lead: "O Pitlane HQ compara sua volta com uma volta mais rápida de uma pessoa real no mesmo carro e pista, e diz, curva a curva, onde o tempo vai embora e o que mudar primeiro.",
      secs: [
        ["As curvas que mais custam", "Cada curva da volta é medida contra a referência: onde você freia, com que velocidade chega ao ápice e quando volta a acelerar. O coach mostra primeiro as curvas que mais perdem tempo."],
        ["Uma dica que segue os dados", "Frear mais tarde ou antes, levar mais velocidade ao ápice, acelerar antes, outro traçado ou outra marcha: cada dica vem do que sua volta e a mais rápida realmente fizeram."],
        ["Referências reais, não uma volta ideal", "A referência é uma volta real: o recorde do carro e pista, ou a volta do piloto logo acima do seu ritmo. Nada é inventado com pedaços de voltas diferentes."],
        ["Um plano para a próxima sessão", "O que treinar primeiro, os hábitos que se repetem na volta e o mapa com as curvas marcadas."],
      ],
      faq: [
        ["O coach de iRacing é grátis?", "Sim. O coach, a telemetria e os overlays do Pitlane HQ são grátis."],
        ["De onde vem a volta mais rápida?", "Das voltas dos pilotos do Pitlane HQ no mesmo carro e pista: a mais rápida e o próximo nível acima do seu ritmo."],
        ["Preciso configurar algo?", "Não. Instale o Pitlane HQ Agent no PC onde você corre, pilote e abra Análise → Coach."],
      ],
    },
  },
  {
    id: "compare",
    en: {
      path: "/iracing-lap-comparison", title: "Compare iRacing laps: speed, inputs and time gap · Pitlane HQ",
      desc: "Compare two iRacing laps for free: speed, throttle, brake, gear, steering and the time gap along the lap, the track map, the sectors and the braking points.",
      h1: "Compare two iRacing laps",
      lead: "Put any two laps side by side: two of yours, one from another session, the record of the car and track or a lap from the leaderboard. Pitlane HQ shows where one gains and the other loses, metre by metre.",
      secs: [
        ["The charts along the lap", "Speed, throttle, brake, gear and steering of both laps, and the time gap growing or shrinking, with the corners marked by their official turn numbers."],
        ["The track map", "Where lap A gains or loses against lap B, both laps' braking points, the incidents and the two racing lines."],
        ["Every corner at a glance", "Each corner as a small bar with the time it gives or takes; press one and the charts and the map go to it."],
        ["Laps from anyone", "Compare with the record of the car and track or with the driver just ahead of your pace, taken from real laps."],
      ],
      faq: [
        ["Can I compare my lap with someone else's?", "Yes: with any lap on the leaderboards of Pitlane HQ for the same car and track."],
        ["Can I see it without the PC?", "Yes. Your laps are in your account: open them at pitlanehq.app or in the Android app."],
        ["Is it free?", "Yes."],
      ],
    },
    es: {
      path: "/es/comparar-vueltas-iracing", title: "Comparar vueltas de iRacing: velocidad, pedales y diferencia · Pitlane HQ",
      desc: "Compara gratis dos vueltas de iRacing: velocidad, acelerador, freno, marcha, volante y la diferencia de tiempo a lo largo de la vuelta, el mapa, los sectores y las frenadas.",
      h1: "Compara dos vueltas de iRacing",
      lead: "Pon dos vueltas una al lado de la otra: dos tuyas, una de otra sesión, el récord del coche y circuito o una vuelta de la clasificación. Pitlane HQ te enseña dónde gana una y pierde la otra, metro a metro.",
      secs: [
        ["Las gráficas a lo largo de la vuelta", "Velocidad, acelerador, freno, marcha y volante de las dos vueltas, y la diferencia de tiempo creciendo o bajando, con las curvas marcadas por su número oficial."],
        ["El mapa del circuito", "Dónde la vuelta A gana o pierde frente a la B, las frenadas de las dos, los incidentes y las dos trazadas."],
        ["Cada curva de un vistazo", "Cada curva como una barra pequeña con el tiempo que da o quita; púlsala y las gráficas y el mapa van a ella."],
        ["Vueltas de cualquiera", "Compárate con el récord del coche y circuito o con el piloto justo por encima de tu ritmo, con vueltas reales."],
      ],
      faq: [
        ["¿Puedo comparar mi vuelta con la de otro?", "Sí: con cualquier vuelta de las clasificaciones de Pitlane HQ del mismo coche y circuito."],
        ["¿Puedo verlo sin el PC?", "Sí. Tus vueltas están en tu cuenta: ábrelas en pitlanehq.app o en la app de Android."],
        ["¿Es gratis?", "Sí."],
      ],
    },
    pt: {
      path: "/pt/comparar-voltas-iracing", title: "Comparar voltas do iRacing: velocidade, pedais e diferença · Pitlane HQ",
      desc: "Compare grátis duas voltas do iRacing: velocidade, acelerador, freio, marcha, volante e a diferença de tempo ao longo da volta, o mapa, os setores e as frenagens.",
      h1: "Compare duas voltas do iRacing",
      lead: "Coloque duas voltas lado a lado: duas suas, uma de outra sessão, o recorde do carro e pista ou uma volta da classificação. O Pitlane HQ mostra onde uma ganha e a outra perde, metro a metro.",
      secs: [
        ["Os gráficos ao longo da volta", "Velocidade, acelerador, freio, marcha e volante das duas voltas, e a diferença de tempo crescendo ou diminuindo, com as curvas marcadas pelo número oficial."],
        ["O mapa da pista", "Onde a volta A ganha ou perde contra a B, as frenagens das duas, os incidentes e os dois traçados."],
        ["Cada curva num relance", "Cada curva como uma barra pequena com o tempo que dá ou tira; toque nela e os gráficos e o mapa vão até ela."],
        ["Voltas de qualquer um", "Compare com o recorde do carro e pista ou com o piloto logo acima do seu ritmo, com voltas reais."],
      ],
      faq: [
        ["Posso comparar minha volta com a de outro?", "Sim: com qualquer volta das classificações do Pitlane HQ no mesmo carro e pista."],
        ["Posso ver sem o PC?", "Sim. Suas voltas estão na sua conta: abra em pitlanehq.app ou no app Android."],
        ["É grátis?", "Sim."],
      ],
    },
  },
  {
    id: "braking",
    en: {
      path: "/iracing-braking-points", title: "iRacing braking points: where and how hard to brake · Pitlane HQ",
      desc: "Find your braking points in iRacing: Pitlane HQ shows where you brake against a faster lap, on the map, in the charts and live on track with braking markers.",
      h1: "Braking points for iRacing",
      lead: "Most lap time is won or lost under braking. Pitlane HQ shows where you brake, how hard and how long, next to a faster lap of the same car, and marks the points on track while you drive.",
      secs: [
        ["Where you brake against a faster lap", "Both laps' braking points on the track map, with the speed before the corner and the lowest speed in it."],
        ["How you brake", "The brake trace of both laps: hard at once or building up, trail braking into the corner, and when you release."],
        ["Braking markers on track", "An overlay marks the next braking point while you drive, taken from the next level above your best lap, and moves with your speed and the car close ahead."],
        ["Named by the official turns", "T1, T2, T7… the same numbers iRacing's track maps use."],
      ],
      faq: [
        ["Where do the braking points come from?", "From real laps of the same car and track: the next level above your pace, or your own best lap while there is none."],
        ["Do the markers work in VR?", "Yes: the overlays also show in the headset through SteamVR."],
        ["Is it free?", "Yes."],
      ],
    },
    es: {
      path: "/es/puntos-de-frenada-iracing", title: "Puntos de frenada en iRacing: dónde y cuánto frenar · Pitlane HQ",
      desc: "Encuentra tus puntos de frenada en iRacing: Pitlane HQ muestra dónde frenas frente a una vuelta más rápida, en el mapa, en las gráficas y en pista con marcas de frenada.",
      h1: "Puntos de frenada para iRacing",
      lead: "La mayor parte del tiempo se gana o se pierde frenando. Pitlane HQ muestra dónde frenas, cuánto y durante cuánto, junto a una vuelta más rápida del mismo coche, y marca los puntos en pista mientras conduces.",
      secs: [
        ["Dónde frenas frente a una vuelta más rápida", "Las frenadas de las dos vueltas en el mapa, con la velocidad antes de la curva y la mínima dentro de ella."],
        ["Cómo frenas", "La traza del freno de las dos vueltas: fuerte de golpe o progresivo, trail braking hacia la curva y cuándo sueltas."],
        ["Marcas de frenada en pista", "Un overlay marca el siguiente punto de frenada mientras conduces, sacado del siguiente nivel por encima de tu mejor vuelta, y se mueve con tu velocidad y con el coche que llevas delante."],
        ["Con las curvas oficiales", "T1, T2, T7… los mismos números que usan los mapas de iRacing."],
      ],
      faq: [
        ["¿De dónde salen los puntos de frenada?", "De vueltas reales del mismo coche y circuito: el siguiente nivel por encima de tu ritmo, o tu propia mejor vuelta mientras no lo haya."],
        ["¿Las marcas funcionan en VR?", "Sí: los overlays también se ven en las gafas a través de SteamVR."],
        ["¿Es gratis?", "Sí."],
      ],
    },
    pt: {
      path: "/pt/pontos-de-frenagem-iracing", title: "Pontos de frenagem no iRacing: onde e quanto frear · Pitlane HQ",
      desc: "Encontre seus pontos de frenagem no iRacing: o Pitlane HQ mostra onde você freia contra uma volta mais rápida, no mapa, nos gráficos e na pista com marcas de frenagem.",
      h1: "Pontos de frenagem para iRacing",
      lead: "A maior parte do tempo se ganha ou se perde na frenagem. O Pitlane HQ mostra onde você freia, quanto e por quanto tempo, ao lado de uma volta mais rápida do mesmo carro, e marca os pontos na pista enquanto você pilota.",
      secs: [
        ["Onde você freia contra uma volta mais rápida", "As frenagens das duas voltas no mapa, com a velocidade antes da curva e a mínima dentro dela."],
        ["Como você freia", "O traço do freio das duas voltas: forte de uma vez ou progressivo, trail braking para a curva e quando você solta."],
        ["Marcas de frenagem na pista", "Um overlay marca o próximo ponto de frenagem enquanto você pilota, tirado do próximo nível acima da sua melhor volta, e se move com a sua velocidade e o carro à frente."],
        ["Com as curvas oficiais", "T1, T2, T7… os mesmos números dos mapas do iRacing."],
      ],
      faq: [
        ["De onde vêm os pontos de frenagem?", "De voltas reais do mesmo carro e pista: o próximo nível acima do seu ritmo, ou a sua melhor volta enquanto não houver."],
        ["As marcas funcionam em VR?", "Sim: os overlays também aparecem nos óculos pelo SteamVR."],
        ["É grátis?", "Sim."],
      ],
    },
  },
  {
    id: "line",
    en: {
      path: "/iracing-racing-line", title: "iRacing racing line: compare your line with a faster lap · Pitlane HQ",
      desc: "See your racing line in iRacing next to a faster lap: Pitlane HQ draws both lines on the track map and says where you were inside or outside at turn-in, apex and exit.",
      h1: "Your racing line in iRacing",
      lead: "Two laps with the same braking point can still be seconds apart because of the line. Pitlane HQ draws your line next to a faster one and measures how far to one side you were, every 5 metres.",
      secs: [
        ["Both lines on the map", "The faster lap's line dashed along the middle of the road and yours beside it, so the difference is plain to see."],
        ["Inside or outside", "At the turn-in, the apex and the exit of each corner, the coach says when you were 1.5 metres or more off the faster line."],
        ["The Line chart", "How far you were to the left or right of the other lap along the whole lap, next to the speed and the inputs."],
        ["From real laps", "The line comes from the laps' own path; when the reference has none, the fastest lap of the car and track with a path gives it."],
      ],
      faq: [
        ["Does iRacing give the position on track?", "Pitlane HQ works it out from the car's speed and heading over the lap, the same way for both laps, so the lines can be compared."],
        ["Is it free?", "Yes."],
      ],
    },
    es: {
      path: "/es/trazada-iracing", title: "Trazada en iRacing: compara tu línea con una vuelta más rápida · Pitlane HQ",
      desc: "Mira tu trazada en iRacing junto a una vuelta más rápida: Pitlane HQ dibuja las dos líneas en el mapa y dice dónde ibas por dentro o por fuera al entrar, en el vértice y a la salida.",
      h1: "Tu trazada en iRacing",
      lead: "Dos vueltas con el mismo punto de frenada pueden estar a segundos por la trazada. Pitlane HQ dibuja tu línea junto a una más rápida y mide cuánto ibas hacia un lado, cada 5 metros.",
      secs: [
        ["Las dos líneas en el mapa", "La línea de la vuelta más rápida discontinua por el centro de la pista y la tuya a su lado, para ver la diferencia de un vistazo."],
        ["Por dentro o por fuera", "En la entrada, el vértice y la salida de cada curva, el coach te dice cuándo ibas a 1,5 metros o más de la línea rápida."],
        ["La gráfica de línea", "Cuánto ibas a la izquierda o a la derecha de la otra vuelta durante toda la vuelta, junto a la velocidad y los pedales."],
        ["Con vueltas reales", "La línea sale del recorrido de las propias vueltas; si la referencia no lo tiene, lo da la vuelta más rápida del coche y circuito que sí lo tenga."],
      ],
      faq: [
        ["¿iRacing da la posición en pista?", "Pitlane HQ la calcula con la velocidad y la dirección del coche a lo largo de la vuelta, igual para las dos vueltas, para poder compararlas."],
        ["¿Es gratis?", "Sí."],
      ],
    },
    pt: {
      path: "/pt/tracado-iracing", title: "Traçado no iRacing: compare sua linha com uma volta mais rápida · Pitlane HQ",
      desc: "Veja seu traçado no iRacing ao lado de uma volta mais rápida: o Pitlane HQ desenha as duas linhas no mapa e diz onde você estava por dentro ou por fora na entrada, no ápice e na saída.",
      h1: "Seu traçado no iRacing",
      lead: "Duas voltas com o mesmo ponto de frenagem podem estar a segundos por causa do traçado. O Pitlane HQ desenha sua linha ao lado de uma mais rápida e mede o quanto você estava para um lado, a cada 5 metros.",
      secs: [
        ["As duas linhas no mapa", "A linha da volta mais rápida tracejada pelo meio da pista e a sua ao lado, para ver a diferença de relance."],
        ["Por dentro ou por fora", "Na entrada, no ápice e na saída de cada curva, o coach diz quando você estava a 1,5 metro ou mais da linha rápida."],
        ["O gráfico de linha", "O quanto você estava à esquerda ou à direita da outra volta ao longo de toda a volta, ao lado da velocidade e dos pedais."],
        ["Com voltas reais", "A linha vem do percurso das próprias voltas; se a referência não tiver, a volta mais rápida do carro e pista que tiver dá a linha."],
      ],
      faq: [
        ["O iRacing dá a posição na pista?", "O Pitlane HQ calcula com a velocidade e a direção do carro ao longo da volta, do mesmo jeito para as duas voltas, para poder compará-las."],
        ["É grátis?", "Sim."],
      ],
    },
  },
  {
    id: "irating",
    en: {
      path: "/iracing-irating-tracker", title: "iRacing iRating and licence tracker for every discipline · Pitlane HQ",
      desc: "Track your iRacing iRating and licence in every discipline: oval, sports car, formula, dirt oval and dirt road, with the change of your last races. Free.",
      h1: "Your iRating and licence in every discipline",
      lead: "iRacing gives you one iRating and one licence per discipline. Pitlane HQ keeps each of them, updated every time you join a session, with what your last races gave or took.",
      secs: [
        ["Five disciplines, five cards", "Oval, sports car, formula, dirt oval and dirt road, each with its iRating, its licence and safety rating as the game shows them."],
        ["What your races did", "The iRating change of your last races of each discipline, and after every race its estimate, replaced by the real change at your next session."],
        ["Race summaries", "Your result, positions gained or lost, incidents and laps of every race, next to the drivers around you."],
        ["Races against the AI apart", "Races against iRacing's AI never touch your iRating, so they show none."],
      ],
      faq: [
        ["Do I need to sign in to iRacing?", "No. Pitlane HQ Agent reads what the game shows while it runs next to iRacing."],
        ["Is it free?", "Yes."],
      ],
    },
    es: {
      path: "/es/irating-iracing", title: "iRating y licencia de iRacing en cada disciplina · Pitlane HQ",
      desc: "Sigue tu iRating y licencia de iRacing en cada disciplina: óvalo, sports car, fórmula, óvalo de tierra y tierra, con el cambio de tus últimas carreras. Gratis.",
      h1: "Tu iRating y licencia en cada disciplina",
      lead: "iRacing te da un iRating y una licencia por disciplina. Pitlane HQ guarda cada uno, al día cada vez que entras en una sesión, con lo que te dieron o quitaron tus últimas carreras.",
      secs: [
        ["Cinco disciplinas, cinco tarjetas", "Óvalo, sports car, fórmula, óvalo de tierra y tierra, cada una con su iRating, su licencia y su safety rating como los muestra el juego."],
        ["Lo que hicieron tus carreras", "El cambio de iRating de tus últimas carreras de cada disciplina, y tras cada carrera su estimación, que se cambia por la real en tu siguiente sesión."],
        ["Resúmenes de carrera", "Tu resultado, las posiciones ganadas o perdidas, los incidentes y las vueltas de cada carrera, junto a los pilotos de tu alrededor."],
        ["Las carreras contra la IA aparte", "Las carreras contra la IA de iRacing no tocan tu iRating, así que no muestran ninguno."],
      ],
      faq: [
        ["¿Tengo que iniciar sesión en iRacing?", "No. Pitlane HQ Agent lee lo que muestra el juego mientras está abierto junto a iRacing."],
        ["¿Es gratis?", "Sí."],
      ],
    },
    pt: {
      path: "/pt/irating-iracing", title: "iRating e licença do iRacing em cada disciplina · Pitlane HQ",
      desc: "Acompanhe seu iRating e licença do iRacing em cada disciplina: oval, sports car, fórmula, oval de terra e terra, com a variação das últimas corridas. Grátis.",
      h1: "Seu iRating e licença em cada disciplina",
      lead: "O iRacing dá um iRating e uma licença por disciplina. O Pitlane HQ guarda cada um, atualizado sempre que você entra numa sessão, com o que suas últimas corridas deram ou tiraram.",
      secs: [
        ["Cinco disciplinas, cinco cartões", "Oval, sports car, fórmula, oval de terra e terra, cada uma com seu iRating, sua licença e seu safety rating como o jogo mostra."],
        ["O que suas corridas fizeram", "A variação de iRating das suas últimas corridas de cada disciplina, e depois de cada corrida a estimativa, trocada pela real na sua próxima sessão."],
        ["Resumos de corrida", "Seu resultado, posições ganhas ou perdidas, incidentes e voltas de cada corrida, ao lado dos pilotos ao seu redor."],
        ["Corridas contra a IA à parte", "Corridas contra a IA do iRacing não mexem no seu iRating, então não mostram nenhum."],
      ],
      faq: [
        ["Preciso entrar no iRacing?", "Não. O Pitlane HQ Agent lê o que o jogo mostra enquanto roda ao lado do iRacing."],
        ["É grátis?", "Sim."],
      ],
    },
  },
  {
    id: "shift",
    en: {
      path: "/iracing-shift-beep", title: "iRacing shift beep: a beep at the RPM you choose · Pitlane HQ",
      desc: "A shift beep for iRacing: Pitlane HQ beeps to change up at the revs you choose for each car, one RPM for every gear or one per gear, or at iRacing's shift lights.",
      h1: "A shift beep for iRacing",
      lead: "Eyes on the track, ears on the engine: Pitlane HQ beeps when it is time to change up, at the revs you choose for each car, a moment early to make up for your reaction time.",
      secs: [
        ["Your RPM, per car", "The same RPM for every gear or one for each gear, kept for each car."],
        ["Or the best estimate", "From your own flat-out laps Pitlane HQ works out where the next gear would pull harder, gear by gear."],
        ["Or iRacing's shift lights", "The beep at the RPM the game's shift lights use."],
        ["Early, pitch and volume", "How early it sounds, a low, middle or high beep and its volume, in Telemetry → Rev beep."],
      ],
      faq: [
        ["Where does it sound?", "On the PC where Pitlane HQ runs, or in the screen where you turn it on."],
        ["Is it free?", "Yes."],
      ],
    },
    es: {
      path: "/es/pitido-cambio-marcha-iracing", title: "Pitido de cambio de marcha para iRacing a las RPM que elijas · Pitlane HQ",
      desc: "Un pitido de cambio para iRacing: Pitlane HQ pita para subir de marcha a las revoluciones que elijas en cada coche, unas RPM para todas las marchas o unas por marcha, o en las luces de iRacing.",
      h1: "Un pitido de cambio de marcha para iRacing",
      lead: "Los ojos en la pista y el oído en el motor: Pitlane HQ pita cuando toca subir de marcha, a las revoluciones que elijas para cada coche, un instante antes para compensar tu tiempo de reacción.",
      secs: [
        ["Tus RPM, por coche", "Las mismas RPM en todas las marchas o unas para cada marcha, guardadas para cada coche."],
        ["O el óptimo estimado", "Con tus propias vueltas a fondo Pitlane HQ calcula dónde la siguiente marcha tiraría más, marcha a marcha."],
        ["O las luces de cambio de iRacing", "El pitido a las RPM de las luces de cambio del juego."],
        ["Adelanto, tono y volumen", "Cuánto antes suena, un pitido grave, medio o agudo y su volumen, en Telemetría → Pitido de revoluciones."],
      ],
      faq: [
        ["¿Dónde suena?", "En el PC donde corre Pitlane HQ, o en la pantalla donde lo actives."],
        ["¿Es gratis?", "Sí."],
      ],
    },
    pt: {
      path: "/pt/bipe-troca-de-marcha-iracing", title: "Bipe de troca de marcha para iRacing no RPM que você escolher · Pitlane HQ",
      desc: "Um bipe de troca para iRacing: o Pitlane HQ apita para subir de marcha nos giros que você escolher em cada carro, um RPM para todas as marchas ou um por marcha, ou nas luzes do iRacing.",
      h1: "Um bipe de troca de marcha para iRacing",
      lead: "Olhos na pista e ouvido no motor: o Pitlane HQ apita quando é hora de subir de marcha, nos giros que você escolher para cada carro, um instante antes para compensar o seu tempo de reação.",
      secs: [
        ["Seu RPM, por carro", "O mesmo RPM em todas as marchas ou um para cada marcha, guardado para cada carro."],
        ["Ou o ótimo estimado", "Com as suas voltas de pé embaixo o Pitlane HQ calcula onde a próxima marcha puxaria mais, marcha a marcha."],
        ["Ou as luzes de troca do iRacing", "O bipe no RPM das luzes de troca do jogo."],
        ["Antecipação, tom e volume", "Quanto antes toca, um bipe grave, médio ou agudo e o volume, em Telemetria → Bipe de giros."],
      ],
      faq: [
        ["Onde toca?", "No PC onde o Pitlane HQ roda, ou na tela onde você o ativar."],
        ["É grátis?", "Sim."],
      ],
    },
  },
  {
    id: "phone",
    en: {
      path: "/iracing-telemetry-on-phone", title: "iRacing telemetry on your phone or tablet, live · Pitlane HQ",
      desc: "Watch your iRacing telemetry live on your phone, tablet or a browser: position, delta, fuel, the relative and the track map, from anywhere. Free, Android and web.",
      h1: "Your iRacing telemetry on the phone",
      lead: "Put the phone or a tablet next to the wheel and see your race live: position, delta, last lap, fuel, the relative and the map. It works over Wi-Fi or mobile data, from anywhere.",
      secs: [
        ["Same account, nothing to pair", "Sign in on the phone with the same Pitlane HQ account as your PC and press Connect: the PC asks you to accept the phone, by its name."],
        ["A friend can watch", "Make a share code on the PC and a friend watches your telemetry from anywhere. They only watch."],
        ["Your laps afterwards", "Every lap goes to your account: analyse it on the phone, compare it and read your race summaries."],
        ["Android and web", "The Android app, or pitlanehq.app in any browser; on iPhone, add the web to the home screen."],
      ],
      faq: [
        ["Does the phone need to be on the same Wi-Fi?", "No. It works from anywhere, over Wi-Fi or mobile data."],
        ["Is it free?", "Yes."],
      ],
    },
    es: {
      path: "/es/telemetria-iracing-en-el-movil", title: "Telemetría de iRacing en el móvil o la tablet, en vivo · Pitlane HQ",
      desc: "Mira tu telemetría de iRacing en vivo en el móvil, la tablet o un navegador: posición, delta, combustible, el relative y el mapa, desde cualquier sitio. Gratis, Android y web.",
      h1: "Tu telemetría de iRacing en el móvil",
      lead: "Pon el móvil o una tablet junto al volante y sigue tu carrera en vivo: posición, delta, última vuelta, combustible, el relative y el mapa. Funciona con Wi-Fi o datos, desde cualquier sitio.",
      secs: [
        ["La misma cuenta, nada que emparejar", "Entra en el móvil con la misma cuenta de Pitlane HQ que en tu PC y pulsa Conectar: el PC te pide aceptar el móvil, por su nombre."],
        ["Un amigo puede verla", "Crea un código en el PC y un amigo ve tu telemetría desde cualquier sitio. Solo mira."],
        ["Tus vueltas, después", "Cada vuelta va a tu cuenta: analízala en el móvil, compárala y lee tus resúmenes de carrera."],
        ["Android y web", "La app de Android, o pitlanehq.app en cualquier navegador; en iPhone, añade la web a la pantalla de inicio."],
      ],
      faq: [
        ["¿El móvil tiene que estar en el mismo Wi-Fi?", "No. Funciona desde cualquier sitio, con Wi-Fi o datos."],
        ["¿Es gratis?", "Sí."],
      ],
    },
    pt: {
      path: "/pt/telemetria-iracing-no-celular", title: "Telemetria do iRacing no celular ou tablet, ao vivo · Pitlane HQ",
      desc: "Veja sua telemetria do iRacing ao vivo no celular, tablet ou navegador: posição, delta, combustível, o relative e o mapa, de qualquer lugar. Grátis, Android e web.",
      h1: "Sua telemetria do iRacing no celular",
      lead: "Coloque o celular ou um tablet ao lado do volante e acompanhe sua corrida ao vivo: posição, delta, última volta, combustível, o relative e o mapa. Funciona com Wi-Fi ou dados, de qualquer lugar.",
      secs: [
        ["A mesma conta, nada para parear", "Entre no celular com a mesma conta do Pitlane HQ do seu PC e toque em Conectar: o PC pede para aceitar o celular, pelo nome."],
        ["Um amigo pode assistir", "Crie um código no PC e um amigo vê sua telemetria de qualquer lugar. Só assiste."],
        ["Suas voltas, depois", "Cada volta vai para a sua conta: analise no celular, compare e leia seus resumos de corrida."],
        ["Android e web", "O app Android, ou pitlanehq.app em qualquer navegador; no iPhone, adicione a web à tela inicial."],
      ],
      faq: [
        ["O celular precisa estar no mesmo Wi-Fi?", "Não. Funciona de qualquer lugar, com Wi-Fi ou dados."],
        ["É grátis?", "Sim."],
      ],
    },
  },
  {
    id: "free",
    en: {
      path: "/free-iracing-telemetry", title: "Free iRacing telemetry, coach and overlays in one app · Pitlane HQ",
      desc: "Free iRacing telemetry software: lap analysis, a coach with real laps, leaderboards, overlays and live telemetry on your phone, in one app for Windows, Android and the web.",
      h1: "Free iRacing telemetry, coach and overlays",
      lead: "Pitlane HQ puts in one free app what usually takes several: lap telemetry and analysis, a coach that compares you with real faster laps, overlays on top of the game, leaderboards and your race summaries.",
      secs: [
        ["Telemetry and analysis", "Every lap recorded with nothing to set up, two laps compared on charts and on the map, the sectors and the braking points."],
        ["A coach", "The corners that cost the most against the record or the driver just ahead of your pace, with what to change."],
        ["Overlays", "Relative, standings, radar, delta bar, fuel, tyres, track map, braking markers and more, also in VR."],
        ["Everywhere", "Windows for driving, and the web and Android to look at your laps and follow your race live."],
      ],
      faq: [
        ["Is it really free?", "Yes. The PC app, the web and the Android app are free."],
        ["Looking for a free alternative to RaceLab, Garage 61 or VRS?", "Pitlane HQ brings overlays, lap telemetry with comparisons and a coach together in one free app for iRacing."],
        ["Which sims?", "iRacing. Le Mans Ultimate, ACC and Assetto Corsa are in development."],
      ],
    },
    es: {
      path: "/es/telemetria-iracing-gratis", title: "Telemetría de iRacing gratis, coach y overlays en una app · Pitlane HQ",
      desc: "Programa de telemetría de iRacing gratis: análisis de vueltas, un coach con vueltas reales, clasificaciones, overlays y telemetría en vivo en el móvil, en una app para Windows, Android y web.",
      h1: "Telemetría de iRacing gratis, coach y overlays",
      lead: "Pitlane HQ reúne en una app gratis lo que suele necesitar varias: telemetría y análisis de vueltas, un coach que te compara con vueltas reales más rápidas, overlays sobre el juego, clasificaciones y tus resúmenes de carrera.",
      secs: [
        ["Telemetría y análisis", "Cada vuelta grabada sin configurar nada, dos vueltas comparadas en gráficas y en el mapa, los sectores y las frenadas."],
        ["Un coach", "Las curvas que más te cuestan frente al récord o al piloto justo por encima de tu ritmo, con qué cambiar."],
        ["Overlays", "Relative, clasificación, radar, barra de delta, combustible, neumáticos, mapa, marcas de frenada y más, también en VR."],
        ["En todas partes", "Windows para conducir, y la web y Android para ver tus vueltas y seguir tu carrera en vivo."],
      ],
      faq: [
        ["¿De verdad es gratis?", "Sí. La app del PC, la web y la app de Android son gratis."],
        ["¿Buscas una alternativa gratis a RaceLab, Garage 61 o VRS?", "Pitlane HQ junta overlays, telemetría de vueltas con comparaciones y un coach en una sola app gratis para iRacing."],
        ["¿Qué simuladores?", "iRacing. Le Mans Ultimate, ACC y Assetto Corsa están en desarrollo."],
      ],
    },
    pt: {
      path: "/pt/telemetria-iracing-gratis", title: "Telemetria do iRacing grátis, coach e overlays num só app · Pitlane HQ",
      desc: "Programa de telemetria do iRacing grátis: análise de voltas, um coach com voltas reais, classificações, overlays e telemetria ao vivo no celular, num app para Windows, Android e web.",
      h1: "Telemetria do iRacing grátis, coach e overlays",
      lead: "O Pitlane HQ junta num app grátis o que costuma precisar de vários: telemetria e análise de voltas, um coach que compara você com voltas reais mais rápidas, overlays sobre o jogo, classificações e seus resumos de corrida.",
      secs: [
        ["Telemetria e análise", "Cada volta gravada sem configurar nada, duas voltas comparadas em gráficos e no mapa, os setores e as frenagens."],
        ["Um coach", "As curvas que mais custam contra o recorde ou o piloto logo acima do seu ritmo, com o que mudar."],
        ["Overlays", "Relative, classificação, radar, barra de delta, combustível, pneus, mapa, marcas de frenagem e mais, também em VR."],
        ["Em todo lugar", "Windows para pilotar, e a web e o Android para ver suas voltas e acompanhar sua corrida ao vivo."],
      ],
      faq: [
        ["É grátis mesmo?", "Sim. O app do PC, a web e o app Android são grátis."],
        ["Procurando uma alternativa grátis ao RaceLab, Garage 61 ou VRS?", "O Pitlane HQ junta overlays, telemetria de voltas com comparações e um coach num só app grátis para iRacing."],
        ["Quais simuladores?", "iRacing. Le Mans Ultimate, ACC e Assetto Corsa estão em desenvolvimento."],
      ],
    },
  },
];

// the guides' heading in each language, for the links at the foot of every public page
export const GUIDES = { en: "Guides", es: "Guías", pt: "Guias" };
