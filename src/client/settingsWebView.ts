import * as vscode from 'vscode';

export class SettingsWebViewProvider implements vscode.WebviewViewProvider {

	public static readonly viewId = 'sc-settings';
	private readonly extensionUri: vscode.Uri;

	private view?: vscode.WebviewView;

	constructor(context: vscode.ExtensionContext) {
		this.extensionUri = context.extensionUri;
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this.view = webviewView;

		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,

			localResourceRoots: [
				this.extensionUri
			]
		};

		webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(data => {
			switch (data.type) {
				case 'colorSelected':
					{
						vscode.window.activeTextEditor?.insertSnippet(new vscode.SnippetString(`#${data.value}`));
						break;
					}
			}
		});
	}

	public addColor() {
		if (this.view) {
			this.view.show?.(true); // `show` is not implemented in 1.49 but is for 1.50 insiders
			this.view.webview.postMessage({ type: 'addColor' });
		}
	}

	public clearColors() {
		if (this.view) {
			this.view.webview.postMessage({ type: 'clearColors' });
		}
	}

	private getHtmlForWebview(webview: vscode.Webview) {
		// The CSS file from the React build output
		const stylesUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, ...[
				"webview-ui",
				"build",
				"static",
				"css",
				"main.css",
			]));
		// The JS file from the React build output
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, ...[
				"webview-ui",
				"build",
				"static",
				"js",
				"main.js",
			]));

		// Tip: Install the es6-string-html VS Code extension to enable code highlighting below
		return /*html*/ `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
				<meta name="theme-color" content="#000000">
				<link rel="stylesheet" type="text/css" href="${stylesUri}">
				<title>Hello World</title>
			</head>
			<body>
				<noscript>You need to enable JavaScript to run this app.</noscript>
				<div id="root"></div>
				<script src="${scriptUri}"></script>
			</body>
			</html>
	    `;
	}
}