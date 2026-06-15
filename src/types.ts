export interface Product {
    title: string;
    titles: Array<string>;
    path: string;
    value: NutritionalValue
}

export interface NutritionalValue {
    calories: number;
    protein: number;
    fat: number;
	carbs: number;
	cholesterol: number;
	sodium: number;
	fiber: number;
}

export const nutritionalValueKeys: Array<keyof NutritionalValue> = [
	"calories",
	"protein",
	"fat",
	"carbs",
	"cholesterol",
	"sodium",
	"fiber",
];

export interface IncomeItem {
    product?: Product;
    weight: number;
    weightIsUnknown?: boolean;
    title: string;
    value: NutritionalValue;
    oneOff?: NutritionalValue;
}

export interface Income {
    total: NutritionalValue;
    items: Array<IncomeItem>;
    unknownProducts: Array<string>;
}

export interface LogLine {
    title: string;
	alias: string;
    weight: number;
    weightIsUnknown?: boolean;
    oneOff?: NutritionalValue;
}
