import { vscode } from "./utilities/vscode";
import { VSCodeButton, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react";

function App() {
  function handleHowdyClick() {
    vscode.postMessage({
      command: "hello",
      text: "Hey there partner! 🤠",
    });
  }

  return (
    <main>
      <h1>Hello World!</h1>
      <VSCodeButton onClick={handleHowdyClick}>Howdy!</VSCodeButton>
      <div>
      <h3>Account</h3>
      <VSCodeDropdown>
        <VSCodeOption>0x957605948208a014D92F8968268053a4E4E14A0D</VSCodeOption>
        <VSCodeOption>0x03E397A7b9f24AdDb07d03176599970a942497ef</VSCodeOption>
        <VSCodeOption>0x957605948208a014D92F8968268053a4E4E14A0D</VSCodeOption>
        <VSCodeOption>0x03E397A7b9f24AdDb07d03176599970a942497ef</VSCodeOption>
        <VSCodeOption>0x957605948208a014D92F8968268053a4E4E14A0D</VSCodeOption>
        <VSCodeOption>0x03E397A7b9f24AdDb07d03176599970a942497ef</VSCodeOption>
        <VSCodeOption>0x957605948208a014D92F8968268053a4E4E14A0D</VSCodeOption>
        <VSCodeOption>0x03E397A7b9f24AdDb07d03176599970a942497ef</VSCodeOption>
      </VSCodeDropdown>
      </div>
    </main>
  );
}

export default App;
