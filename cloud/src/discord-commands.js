// The Discord bot's slash commands, in English with their Spanish and Portuguese (Brazil) names. Registered with
// Discord by discord-register.mjs (the deploy workflow runs it when the bot's secrets exist). The Pro ones are the
// "discordPro" list of license_plans.json: open to everyone while the subscription is off (enforce: false).
const S = 3, C = 7; // option types: string, channel
const loc = (es, pt) => ({
  name_localizations: { "es-ES": es[0], "es-419": es[0], "pt-BR": pt[0] },
  description_localizations: { "es-ES": es[1], "es-419": es[1], "pt-BR": pt[1] },
});
const combo = { type: S, name: "car_track", description: "Car and track (type to search)", required: true, autocomplete: true,
  ...loc(["coche_circuito", "Coche y circuito (escribe para buscar)"], ["carro_pista", "Carro e pista (digite para buscar)"]) };
const name = (required) => ({ type: S, name: "name", description: "Their Pitlane HQ name", autocomplete: true, ...(required ? { required } : {}),
  ...loc(["nombre", "Su nombre en Pitlane HQ"], ["nome", "O nome no Pitlane HQ"]) });

// the languages to choose (each in its own name); "auto" is the Discord app's language
const langs = (auto) => [
  ...(auto ? [{ name: "Automatic (Discord's language)", value: "auto", name_localizations: { "es-ES": "Automático (el idioma de Discord)", "es-419": "Automático (el idioma de Discord)", "pt-BR": "Automático (o idioma do Discord)" } }] : []),
  { name: "English", value: "en" }, { name: "Español", value: "es" }, { name: "Português", value: "pt" },
];

export const COMMANDS = [
  { name: "record", description: "The record and the top 10 of a car and track", options: [combo],
    ...loc(["record", "El récord y el top 10 de un coche y circuito"], ["recorde", "O recorde e o top 10 de um carro e pista"]) },
  { name: "driver", description: "A driver's profile (yours without a name)", options: [name(false)],
    ...loc(["piloto", "El perfil de un piloto (el tuyo sin nombre)"], ["piloto", "O perfil de um piloto (o seu sem nome)"]) },
  { name: "link", description: "Link your Pitlane HQ account to Discord",
    ...loc(["vincular", "Vincula tu cuenta de Pitlane HQ con Discord"], ["vincular", "Vincule a sua conta do Pitlane HQ ao Discord"]) },
  { name: "unlink", description: "Unlink your Pitlane HQ account from Discord",
    ...loc(["desvincular", "Desvincula tu cuenta de Pitlane HQ de Discord"], ["desvincular", "Desvincule a sua conta do Pitlane HQ do Discord"]) },
  { name: "download", description: "Download Pitlane HQ",
    ...loc(["descargar", "Descargar Pitlane HQ"], ["baixar", "Baixar o Pitlane HQ"]) },
  { name: "help", description: "What the Pitlane HQ bot does",
    ...loc(["ayuda", "Qué hace el bot de Pitlane HQ"], ["ajuda", "O que o bot do Pitlane HQ faz"]) },
  { name: "language", description: "The language the bot answers you in",
    ...loc(["idioma", "El idioma en que te responde el bot"], ["idioma", "O idioma em que o bot responde a você"]),
    options: [{ type: S, name: "lang", description: "Language", required: true, choices: langs(true),
      ...loc(["idioma", "Idioma"], ["idioma", "Idioma"]) }] },
  // Pro
  { name: "coach", description: "Pro · Your best lap against the next level and the record", options: [combo],
    ...loc(["coach", "Pro · Tu mejor vuelta contra el siguiente nivel y el récord"], ["coach", "Pro · A sua melhor volta contra o próximo nível e o recorde"]) },
  { name: "compare", description: "Pro · Your best laps against another driver's", options: [name(true)],
    ...loc(["comparar", "Pro · Tus mejores vueltas contra las de otro piloto"], ["comparar", "Pro · As suas melhores voltas contra as de outro piloto"]) },
  { name: "board", description: "Pro · This server's ranking on a car and track", options: [combo], contexts: [0],
    ...loc(["ranking", "Pro · El ranking de este servidor en un coche y circuito"], ["ranking", "Pro · O ranking deste servidor em um carro e pista"]) },
  { name: "alerts", description: "Pro · Post this server's new best laps and records in a channel", default_member_permissions: "32", contexts: [0],
    ...loc(["alertas", "Pro · Publica las mejores vueltas y récords de este servidor en un canal"], ["alertas", "Pro · Publica as melhores voltas e recordes deste servidor em um canal"]),
    options: [{ type: C, name: "channel", description: "The channel (empty: turn the alerts off)", channel_types: [0, 5],
      ...loc(["canal", "El canal (vacío: apaga las alertas)"], ["canal", "O canal (vazio: desliga os alertas)"]) },
      { type: S, name: "language", description: "The alerts' language (default: the server's)", choices: langs(false),
        ...loc(["idioma", "El idioma de las alertas (por defecto: el del servidor)"], ["idioma", "O idioma dos alertas (padrão: o do servidor)"]) }] },
];
