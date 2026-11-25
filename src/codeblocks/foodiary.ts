import { 
    MarkdownPostProcessorContext,    
    MarkdownRenderer,
} from 'obsidian';

import { Parser } from 'expr-eval';

import { LogLine, NutritionalValue, Income, nutritionalValueKeys } from '../types';

import FoodiaryProducts from '../products';

import Foodiary from '../main';

export default class FoodiaryCodeBlock {
    public static async renderDiary(
        plugin: Foodiary,
        src: string,
        body: HTMLElement,
        ctx: MarkdownPostProcessorContext,
    ) {
        const income = await this.income(plugin, src);

        let goal = 0;
        let hasGoal = false;

        if (plugin.settings.propertyDailyCalorieGoal != "") {
            const frontmatter = await this.fileProperties(
                plugin,
                ctx.sourcePath,
            );
            if (frontmatter) {
                goal = this.propertyValue(
                    frontmatter[plugin.settings.propertyDailyCalorieGoal],
                );
                hasGoal = goal > 0;
            }
        }

        const lines: string[] = [];

        if (income.unknownProducts.length > 0) {
            lines.push("> [!missing] Missing products");

            for (const item of income.unknownProducts) {
                lines.push(
                    `> - [[${plugin.settings.productsFolder}/${item}|${item}]]`,
                );
            }

            lines.push("");
        }

        const columnDefs = [
            {
                label: "Product",
                key: null,
                setting: null,
                align: "left" as const,
            },
            {
                label: "Calories",
                key: "calories" as const,
                setting: plugin.settings.showColumnCalories,
                align: "right" as const,
            },
            {
                label: "Protein",
                key: "protein" as const,
                setting: plugin.settings.showColumnProtein,
                align: "right" as const,
            },
            {
                label: "Fat",
                key: "fat" as const,
                setting: plugin.settings.showColumnFat,
                align: "right" as const,
            },
            {
                label: "Carbs",
                key: "carbs" as const,
                setting: plugin.settings.showColumnCarbs,
                align: "right" as const,
            },
            {
                label: "Cholesterol",
                key: "cholesterol" as const,
                setting: plugin.settings.showColumnCholesterol,
                align: "right" as const,
            },
            {
                label: "Sodium",
                key: "sodium" as const,
                setting: plugin.settings.showColumnSodium,
                align: "right" as const,
            },
            {
                label: "Fiber",
                key: "fiber" as const,
                setting: plugin.settings.showColumnFiber,
                align: "right" as const,
            },
        ];

        const visibleColumns = columnDefs.filter(
            (col) => col.setting !== false,
        );

        const header = "| " + visibleColumns.map((col) => col.label).join(" | ") + " |";
        const separator = "| " + visibleColumns.map((col) =>
            col.align === "right" ? "---:" : "---"
        ).join(" | ") + " |";

        const tableLines = [header, separator];

        for (const item of income.items) {
            const cells = visibleColumns.map((col) => {
                if (!col.key) {
                    const weightText = item.weightIsUnknown ? "?" : item.weight.toString();

                    if (item.product?.path) {
                        return `[[${item.product.path}\\|${item.title}]] (${weightText})`;
                    }

                    return `${item.title} (${weightText})`;
                }

                return item.value[col.key].toString();
            });

            tableLines.push("| " + cells.join(" | ") + " |");
        }

        const totalCells = visibleColumns.map((col) => {
            if (!col.key) {
                return "**Total**";
            }

            if (col.key === "calories" && hasGoal) {
                return `**${income.total.calories.toString()} / ${goal.toString()}**`;
            }

            return `**${income.total[col.key].toString()}**`;
        });
        tableLines.push("| " + totalCells.join(" | ") + " |");

        if (hasGoal) {
            const remaining = goal - income.total.calories;

            const remainingCells = visibleColumns.map((col) => {
                if (!col.key) {
                    return "**Remaining**";
                }

                if (col.key === "calories") {
                    return `**${remaining.toString()}**`;
                }

                return "";
            });

            tableLines.push("| " + remainingCells.join(" | ") + " |");
        }

        lines.push(...tableLines);

        await MarkdownRenderer.render(
            plugin.app,
            lines.join("\n"),
            body,
            ctx.sourcePath,
            plugin,
        );
    }

    private static propertyValue(propertyValue: number) {
        return typeof propertyValue == "number" ? propertyValue : 0;
    }

    private static async fileProperties(plugin: Foodiary, sourcePath: string) {
        return plugin.app.metadataCache.getCache(sourcePath)?.frontmatter;
    }

    private static async income(plugin: Foodiary, source: string) {
        const result: Income = {
            items: [],
            total: await this.getNutritionalValue(),
            unknownProducts: [],
        };

        const products = await FoodiaryProducts.products(plugin);

        const sourceLines = source.split("\n");

        for (const sourceLine of sourceLines) {
            const entry = await this.getLogEntry(sourceLine);

            // Empty row, I guess?

            if (!entry.title) {
                continue;
            }

            if (entry.oneOff) {
                const incomeTitle = entry.alias;
                let incomeItem = plugin.settings.groupEntriesByTitles
                    ? result.items.find((el) => el.title == incomeTitle && el.oneOff)
                    : undefined;

                if (incomeItem == undefined) {
                    const newItem = {
                        product: undefined,
                        weight: 0,
                        weightIsUnknown: entry.weightIsUnknown,
                        title: incomeTitle,
                        value: await this.getNutritionalValue(),
                        oneOff: await this.getNutritionalValue(),
                    };
                    this.addOneOffValues(entry.oneOff, newItem.oneOff);
                    this.addOneOffValues(entry.oneOff, newItem.value);
                    result.items.push(newItem);
                    incomeItem = result.items[result.items.length - 1];
                } else {
                    if (incomeItem.oneOff) {
                        this.addOneOffValues(entry.oneOff, incomeItem.oneOff);
                    }
                    this.addOneOffValues(entry.oneOff, incomeItem.value);
                }

                incomeItem.weight += entry.weight;
                if (entry.weightIsUnknown) {
                    incomeItem.weightIsUnknown = true;
                }
                continue;
            }

            const titleToSearch = entry.title.toLowerCase();

            const product = products.find((el) =>
                el.titles.find((el) => el == titleToSearch),
            );

            if (product === undefined) {
                result.unknownProducts.push(entry.title);
                continue;
            }

            const incomeTitle = plugin.settings.showProductFolderTitles
                ? product.title
                : entry.alias;
            let incomeItem = plugin.settings.groupEntriesByTitles
                ? result.items.find((el) => el.title == incomeTitle)
                : undefined;

            if (incomeItem == undefined) {
                result.items.push({
                    product: product,
                    weight: 0,
                    title: incomeTitle,
                    value: await this.getNutritionalValue(),
                });
                incomeItem = result.items[result.items.length - 1];
            }

            incomeItem.weight += entry.weight;
        }

        await this.calculateIncomeItemValues(result);
        if (plugin.settings.sortByCalories) {
            await this.sortIncomeItemsByCalories(result);
        }

        await this.calculateIncomeTotal(result);

        await this.processUnknownProducts(result);

        return result;
    }

    private static addOneOffValues(src: NutritionalValue, dst: NutritionalValue) {
        dst.calories += src.calories;
        dst.protein += src.protein;
        dst.fat += src.fat;
        dst.carbs += src.carbs;
        dst.cholesterol += src.cholesterol;
        dst.sodium += src.sodium;
        dst.fiber += src.fiber;
    }

    private static async calculateIncomeItemValues(income: Income) {
        for (const item of income.items) {
            if (item.oneOff || !item.product) {
                continue;
            }
            item.value.calories = Math.ceil(
                (item.product.value.calories * item.weight) / 100,
            );
            item.value.protein = Math.ceil(
                (item.product.value.protein * item.weight) / 100,
            );
            item.value.fat = Math.ceil(
                (item.product.value.fat * item.weight) / 100,
            );
            item.value.carbs = Math.ceil(
                (item.product.value.carbs * item.weight) / 100,
            );
            item.value.cholesterol = Math.ceil(
                (item.product.value.cholesterol * item.weight) / 100,
            );
            item.value.sodium = Math.ceil(
                (item.product.value.sodium * item.weight) / 100,
            );
            item.value.fiber = Math.ceil(
                (item.product.value.fiber * item.weight) / 100,
            );
        }
    }

    private static async processUnknownProducts(income: Income) {
        income.unknownProducts = Array.from(new Set(income.unknownProducts));
        income.unknownProducts.sort();
    }

    private static async sortIncomeItemsByCalories(income: Income) {
        income.items.sort((l, r): number => {
            if (l.value.calories < r.value.calories) return 1;
            if (l.value.calories > r.value.calories) return -1;
            return 0;
        });
    }

    private static async calculateIncomeTotal(income: Income) {
        for (const item of income.items) {
            if (item.oneOff) {
                income.total.calories += item.value.calories;
                income.total.protein += item.value.protein;
                income.total.fat += item.value.fat;
                income.total.carbs += item.value.carbs;
                income.total.cholesterol += item.value.cholesterol;
                income.total.sodium += item.value.sodium;
                income.total.fiber += item.value.fiber;
            } else if (item.product) {
                income.total.calories +=
                    (item.product.value.calories * item.weight) / 100;
                income.total.protein +=
                    (item.product.value.protein * item.weight) / 100;
                income.total.fat += (item.product.value.fat * item.weight) / 100;
                income.total.carbs +=
                    (item.product.value.carbs * item.weight) / 100;
                income.total.cholesterol +=
                    (item.product.value.cholesterol * item.weight) / 100;
                income.total.sodium +=
                    (item.product.value.sodium * item.weight) / 100;
                income.total.fiber +=
                    (item.product.value.fiber * item.weight) / 100;
            }
        }
        income.total.calories = Math.ceil(income.total.calories);
        income.total.protein = Math.ceil(income.total.protein);
        income.total.fat = Math.ceil(income.total.fat);
        income.total.carbs = Math.ceil(income.total.carbs);
        income.total.cholesterol = Math.ceil(income.total.cholesterol);
        income.total.sodium = Math.ceil(income.total.sodium);
        income.total.fiber = Math.ceil(income.total.fiber);
    }

    private static async getNutritionalValue(): Promise<NutritionalValue> {
        return {
            calories: 0,
            protein: 0,
            fat: 0,
            carbs: 0,
            cholesterol: 0,
            sodium: 0,
            fiber: 0,
        };
    }

    private static async getLogEntry(input: string): Promise<LogLine> {
        const result: LogLine = {
            title: "",
            alias: "",
            weight: 0,
        };

        input = input.replace(/#.*|\/\/.*/g, "").trim();

        if (input != "") {
            const oneOffMatch = input.match(/\(([^)]*)\)$/);
            if (oneOffMatch) {
                result.oneOff = this.parseOneOff(oneOffMatch[1]);
                input = input.substring(0, oneOffMatch.index).trim();
            }

            const inputParts = input.split(" ");

            if (inputParts.length > 1) {
                const weightString = inputParts.pop();

                if (weightString != undefined) {
                    if (weightString === "?") {
                        if (!result.oneOff) {
                            throw new Error(
                                `Unable to parse weight of food in "${input}."`,
                            );
                        }
                        result.weight = 0;
                        result.weightIsUnknown = true;
                    } else {
                        try {
                            result.weight =
                                await Parser.parse(weightString).evaluate();
                        } catch (error) {
                            throw new Error(
                                `Unable to parse weight of food in "${input}."`,
                            );
                        }
                    }
                }
            }

            const titleAndAlias = inputParts
                .join(" ")
                .replace(/(\[\[)|(\]\])/g, "") // Strip link markers (`[[`, `]]`)
                .split("|"); // Support for aliases
            result.title = titleAndAlias[0].replace(/\.md$/i, "").trim(); // Both `[[Foo]]` and `[[Foo.md]]` are valid links, normalize
            result.alias =
                titleAndAlias.length > 1
                    ? titleAndAlias[1].trim()
                    : result.title;
        }

        return result;
    }

    /**
     * Parse an input one-off entry.
     * 
     * Input format:
     * 
     * ```text
     * ([<key>: <value>], [...])
     * ```
     * 
     * Where:
     * 
     * - `<key>`: "calories" | "protein" | "fat" | "carbs" | "cholesterol" | "sodium" | "fiber"
     * - `<value>`: int
     * 
     * Example:
     * 
     * ```text
     * (calories: 113, protein: 22, fat: 2, carbs: 4)
     * ```
     * 
     * @param s Input string
     * @returns The parsed `NutritinalValue` object
     */
    private static parseOneOff(s: string): NutritionalValue {
        s = s.replace(/^\(|\)$/g, ""); // Remove leading and trailing `(`, `)`s
        
        // split by comma, then into kv pairs, and trim all the parts
        const kvPairs = s
            .split(",")
            .map((e) => e.trim())
            .filter(Boolean)
            .map((e) => e.split(":").map((e) => e.trim()));

        const res: NutritionalValue = {
            calories: 0,
            carbs: 0,
            cholesterol: 0,
            fat: 0,
            fiber: 0,
            protein: 0,
            sodium: 0
        };

        kvPairs.forEach(pair => {
            if (pair.length != 2) throw new Error(
                `Invalid key-value pair in one-off nutritional values: "${s}"`,
            );
            pair[0] = pair[0].toLowerCase()
            if (!nutritionalValueKeys.includes(pair[0] as keyof NutritionalValue)) throw new Error(
                `Unknown nutritional key "${pair[0]}" in one-off entry: "${s}"`,
            );
            res[pair[0] as keyof NutritionalValue] = Parser.parse(pair[1]).evaluate();
        })

        return res;
    }
}
