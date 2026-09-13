import { XMLParser } from "fast-xml-parser";

interface Valute {
  NumCode: number;
  CharCode: string;
  Nominal: number;
  Name: string;
  Value: number;
  VunitRate: number;
}

export const currencyService = {
  rates: [] as Valute[],
  lastUpdate: undefined as undefined | Date,
  /** Returns false when the rates could not be fetched. */
  updataRates: async () => {
    try {
      const response = await fetch("https://www.cbr.ru/scripts/XML_daily.asp");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const rawData = await response.arrayBuffer();
      const decoder = new TextDecoder("windows-1251");
      const text = decoder.decode(rawData).replaceAll(",", ".");

      const parser = new XMLParser();
      const data = parser.parse(text) as { ValCurs: { Valute: Valute[] } };

      console.log(
        "VALUTES:",
        data.ValCurs.Valute.map((val) => val.CharCode)
      );

      currencyService.rates = data.ValCurs.Valute;
      currencyService.lastUpdate = new Date();
      return true;
    } catch (err) {
      console.error("Unable to get valutes:", err);
      return false;
    }
  },
  /** Converts to rubles; null when there is no rate for the currency. */
  convert: (from: string, value: number) => {
    const fromValute = currencyService.rates.find((el) => {
      return el.CharCode === from;
    });
    if (!fromValute) {
      console.log(`Unknown Valute ${from}`);
      return null;
    }
    return value * fromValute.VunitRate;
  },
};
