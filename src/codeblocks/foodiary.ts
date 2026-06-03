import { 
    MarkdownPostProcessorContext,    
    MarkdownRenderer,
    TFile,
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

        if (income.unknownProducts.length > 0) {
            const upLines = [];

            upLines.push("> [!missing] Missing products");

            for (const item of income.unknownProducts) {
                upLines.push(
                    `> - [[${plugin.settings.productsFolder}/${item.toString()}|${item.toString()}]]`,
                );
            }

            MarkdownRenderer.render(
                plugin.app,
                upLines.join("\n"),
                body,
                "",
                plugin,
            );
            body.createEl("br");
        }

        const table = body.createEl("table");

        const columnDefs = [
            { label: "Product", key: null, setting: null },
            {
                label: "Calories",
                key: "calories" as const,
                setting: plugin.settings.showColumnCalories,
            },
            {
                label: "Protein",
                key: "protein" as const,
                setting: plugin.settings.showColumnProtein,
            },
            {
                label: "Fat",
                key: "fat" as const,
                setting: plugin.settings.showColumnFat,
            },
            {
                label: "Carbs",
                key: "carbs" as const,
                setting: plugin.settings.showColumnCarbs,
            },
            {
                label: "Cholesterol",
                key: "cholesterol" as const,
                setting: plugin.settings.showColumnCholesterol,
            },
            {
                label: "Sodium",
                key: "sodium" as const,
                setting: plugin.settings.showColumnSodium,
            },
            {
                label: "Fiber",
                key: "fiber" as const,
                setting: plugin.settings.showColumnFiber,
            },
        ];

        const visibleColumns = columnDefs.filter(
            (col) => col.setting !== false,
        );

        let tr = table.createEl("tr");
        for (const col of visibleColumns) {
            tr.createEl("th", { text: col.label });
        }

        for (const item of income.items) {
            tr = table.createEl("tr");
            for (const col of visibleColumns) {
                const td = tr.createEl("td");
                if (!col.key) {
                    td.createEl("span", {
                        text: `${item.title} (${item.weightIsUnknown ? "?" : item.weight.toString()})`,
                    });
                } else {
                    td.textContent = item.value[col.key].toString();
                }
            }
        }

        let goal = 0;
        let hasGoal = false;

        if (plugin.settings.propertyDailyCalorieGoal != "") {
            const currentFile = plugin.app.workspace.getActiveFile();
            if (currentFile) {
                const frontmatter = await this.fileProperties(
                    plugin,
                    currentFile,
                );
                if (frontmatter) {
                    goal = this.propertyValue(
                        frontmatter[plugin.settings.propertyDailyCalorieGoal],
                    );
                    hasGoal = goal > 0;
                }
            }
        }

        tr = table.createEl("tr");
        for (const col of visibleColumns) {
            let cellValue: string;
            if (!col.key) {
                cellValue = "Total";
            } else if (col.key === "calories" && hasGoal) {
                cellValue =
                    income.total.calories.toString() + " / " + goal.toString();
            } else {
                cellValue = income.total[col.key].toString();
            }
            tr.createEl("td").createEl("strong", { text: cellValue });
        }

        if (hasGoal) {
            const remaining = goal - income.total.calories;

            tr = table.createEl("tr");
            for (const col of visibleColumns) {
                let cellValue: string;
                if (!col.key) {
                    cellValue = "Remaining";
                } else if (col.key === "calories") {
                    cellValue = remaining.toString();
                } else {
                    cellValue = "";
                }
                tr.createEl("td").createEl("strong", { text: cellValue });
            }
        }
    }

    private static propertyValue(propertyValue: number) {
        return typeof propertyValue == "number" ? propertyValue : 0;
    }

    private static async fileProperties(plugin: Foodiary, file: TFile) {
        return plugin.app.metadataCache.getFileCache(file)?.frontmatter;
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
                    this.addOneOffValues(entry.oneOff, incomeItem.oneOff!);
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
            if (item.oneOff) {
                continue;
            }
            item.value.calories = Math.ceil(
                (item.product!.value.calories * item.weight) / 100,
            );
            item.value.protein = Math.ceil(
                (item.product!.value.protein * item.weight) / 100,
            );
            item.value.fat = Math.ceil(
                (item.product!.value.fat * item.weight) / 100,
            );
            item.value.carbs = Math.ceil(
                (item.product!.value.carbs * item.weight) / 100,
            );
            item.value.cholesterol = Math.ceil(
                (item.product!.value.cholesterol * item.weight) / 100,
            );
            item.value.sodium = Math.ceil(
                (item.product!.value.sodium * item.weight) / 100,
            );
            item.value.fiber = Math.ceil(
                (item.product!.value.fiber * item.weight) / 100,
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
            } else {
                income.total.calories +=
                    (item.product!.value.calories * item.weight) / 100;
                income.total.protein +=
                    (item.product!.value.protein * item.weight) / 100;
                income.total.fat += (item.product!.value.fat * item.weight) / 100;
                income.total.carbs +=
                    (item.product!.value.carbs * item.weight) / 100;
                income.total.cholesterol +=
                    (item.product!.value.cholesterol * item.weight) / 100;
                income.total.sodium +=
                    (item.product!.value.sodium * item.weight) / 100;
                income.total.fiber +=
                    (item.product!.value.fiber * item.weight) / 100;
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
