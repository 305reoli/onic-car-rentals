import type { Lang } from "@/lib/i18n";

/** Editorial per exact active brand/model identity; never supplies unit-specific specs. */
export const modelDescriptions: Record<string, Record<Lang, string>> = {
  // ESQUELETO: descricoes dos seus modelos de carro, por idioma.
};

/** Verified model-level architecture only; official citations kept with the values. */
export const officialEngines: Record<string, {
  // ESQUELETO: motores oficiais dos seus modelos.
}> = {
  "Ferrari 296 GTB": {
    "pt": "V6 híbrido de 120°",
    "en": "120° V6 hybrid",
    "es": "V6 híbrido de 120°",
    "source": "https://www.ferrari.com/en-EN/corporate/articles/296-gtb-defining-fun-to-drive"
  },
  "Ferrari Purosangue": {
    "pt": "V12 aspirado",
    "en": "Naturally aspirated V12",
    "es": "V12 atmosférico",
    "source": "https://www.ferrari.com/en-EN/corporate/articles/ferrari-purosangue-unlike-any-other"
  },
  "Lamborghini Huracan Evo Spyder": {
    "pt": "V10 aspirado",
    "en": "Naturally aspirated V10",
    "es": "V10 atmosférico",
    "source": "https://www.lamborghini.com/en-en/history/huracan-evo-spyder"
  },
  "Ferrari Portofino": {
    "pt": "V8 turbo",
    "en": "Turbocharged V8",
    "es": "V8 turbo",
    "source": "https://www.ferrari.com/en-EN/corporate/articles/the-ferrari-portofino-revealed"
  }
};
