import { 
    Plugin,
    Editor,
    MarkdownView,
} from 'obsidian';

import { 
    FoodiarySettingTab,
    FoodiarySettings,
    DEFAULT_SETTINGS 
} from './settings';

import FoodiaryCodeBlock from './codeblocks/foodiary';

export default class Foodiary extends Plugin {    
    settings: FoodiarySettings;

    async onload() {
        
        await this.loadSettings();

		this.addSettingTab(new FoodiarySettingTab(this.app, this));

		this.addCommand({
			id: 'insert-food-log',
			name: 'Insert food diary',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				editor.replaceSelection("```foodiary\n\n```");
				const cursor = editor.getCursor();
				editor.setCursor({line: cursor.line - 1, ch: 0});
			}
		});

        this.registerMarkdownCodeBlockProcessor("foodiary", async (src, el, ctx) => {
            
            try 
            {            
                const root = el.createEl("div");
				root.style.overflow = "auto";
                const body = root.createEl("div");

                await FoodiaryCodeBlock.renderDiary(this, src, body, ctx);
            }
            catch (error) 
            {
                el.createEl("h3", {text: `Failed to render a food diary: ${(error as Error).message}`});
            }

        });
    }

    onunload() {        
    }

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
    
}
