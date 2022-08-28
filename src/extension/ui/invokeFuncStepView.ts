import { QuickPickItem, window, Disposable, QuickInputButton, QuickInput, QuickInputButtons } from 'vscode';
import { AbiItem } from 'web3-utils';

export async function multiStepInput(abi: AbiItem[]) {

    async function invokeMethod() {
        const callData: any[] = [];
        await MultiStepInput.run(input => pickMethod(input, callData));
        return callData;
    }
    async function pickMethod(input: MultiStepInput, callData: any[]) {
        let step = 1;
        let totalSteps = 1;
        const title = 'Invoke Contract Method';
        let selectedMethod;
        try {
            selectedMethod = await input.showQuickPick({
                title,
                step: step++,
                totalSteps,
                placeholder: 'Pick a Method',
                items: abi.map((label: any) => ({ label: label.name })),
                shouldResume: shouldResume
            });
        } catch (error) {
            // console.log(error)
        }
        if (!selectedMethod) {
            return;
        }
        callData.push(selectedMethod.label);
        for (const item of abi) {
            if (item.name === selectedMethod.label) {
                totalSteps += item.inputs!.length;
                for (const param of item.inputs!) {
                    let value;
                    try {
                        value = await input.showInputBox({
                            title,
                            step: step++,
                            totalSteps,
                            value: '',
                            validate: validateInput.bind(undefined, param.type),
                            prompt: `Input '${param.name}' value, type:${param.type}`,
                            shouldResume: shouldResume
                        });
                    } catch (error) {
                        // clear data
                        callData.splice(0, callData.length);
                        // console.log(error)
                    }

                    if (!value) {
                        return;
                    }
                    callData.push(value);
                }
                break;
            }
        }
        return undefined;
    }

    async function validateInput(type: string, value: string) {
        let isValid = true;
        if (type.indexOf('int') !== -1) {
            isValid = !isNaN(parseInt(value));
        }
        return isValid ? undefined : 'error';
    }

    function shouldResume() {
        // Could show a notification with the option to resume.
        return new Promise<boolean>((resolve, reject) => {
            // noop
        });
    }

    return await invokeMethod();
}


// -------------------------------------------------------
// Helper code that wraps the API for the multi-step case.
// -------------------------------------------------------


class InputFlowAction {
    static back = new InputFlowAction();
    static cancel = new InputFlowAction();
    static resume = new InputFlowAction();
}

type InputStep = (input: MultiStepInput) => Thenable<InputStep | void>;

interface QuickPickParameters<T extends QuickPickItem> {
    title: string;
    step: number;
    totalSteps: number;
    items: T[];
    activeItem?: T;
    placeholder: string;
    buttons?: QuickInputButton[];
    shouldResume: () => Thenable<boolean>;
}

interface InputBoxParameters {
    title: string;
    step: number;
    totalSteps: number;
    value: string;
    prompt: string;
    validate: (value: string) => Promise<string | undefined>;
    buttons?: QuickInputButton[];
    shouldResume: () => Thenable<boolean>;
}

class MultiStepInput {

    static async run<T>(start: InputStep) {
        const input = new MultiStepInput();
        return input.stepThrough(start);
    }

    private current?: QuickInput;
    private steps: InputStep[] = [];

    private async stepThrough<T>(start: InputStep) {
        let step: InputStep | void = start;
        while (step) {
            this.steps.push(step);
            if (this.current) {
                this.current.enabled = false;
                this.current.busy = true;
            }
            try {
                step = await step(this);
            } catch (err) {
                if (err === InputFlowAction.back) {
                    this.steps.pop();
                    step = this.steps.pop();
                } else if (err === InputFlowAction.resume) {
                    step = this.steps.pop();
                } else if (err === InputFlowAction.cancel) {
                    step = undefined;
                } else {
                    throw err;
                }
            }
        }
        if (this.current) {
            this.current.dispose();
        }
    }

    async showQuickPick<T extends QuickPickItem, P extends QuickPickParameters<T>>({ title, step, totalSteps, items, activeItem, placeholder, buttons, shouldResume }: P) {
        const disposables: Disposable[] = [];
        try {
            return await new Promise<T | (P extends { buttons: (infer I)[]; } ? I : never)>((resolve, reject) => {
                const input = window.createQuickPick<T>();
                input.title = title;
                input.step = step;
                input.totalSteps = totalSteps;
                input.placeholder = placeholder;
                input.items = items;
                if (activeItem) {
                    input.activeItems = [activeItem];
                }
                input.buttons = [
                    ...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
                    ...(buttons || [])
                ];
                disposables.push(
                    input.onDidTriggerButton(item => {
                        if (item === QuickInputButtons.Back) {
                            reject(InputFlowAction.back);
                        } else {
                            resolve(<any>item);
                        }
                    }),
                    input.onDidChangeSelection(items => resolve(items[0])),
                    input.onDidHide(() => {
                        (async () => {
                            // no need to use resume logic
                            // reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
                            reject(InputFlowAction.cancel);
                        })()
                            .catch(reject);
                    })
                );
                if (this.current) {
                    this.current.dispose();
                }
                this.current = input;
                this.current.show();
            });
        } finally {
            disposables.forEach(d => d.dispose());
        }
    }

    async showInputBox<P extends InputBoxParameters>({ title, step, totalSteps, value, prompt, validate, buttons, shouldResume }: P) {
        const disposables: Disposable[] = [];
        try {
            return await new Promise<string | (P extends { buttons: (infer I)[]; } ? I : never)>((resolve, reject) => {
                const input = window.createInputBox();
                input.title = title;
                input.step = step;
                input.totalSteps = totalSteps;
                input.value = value || '';
                input.prompt = prompt;
                input.buttons = [
                    ...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
                    ...(buttons || [])
                ];
                let validating = validate('');
                disposables.push(
                    input.onDidTriggerButton(item => {
                        if (item === QuickInputButtons.Back) {
                            reject(InputFlowAction.back);
                        } else {
                            resolve(<any>item);
                        }
                    }),
                    input.onDidAccept(async () => {
                        const value = input.value;
                        input.enabled = false;
                        input.busy = true;
                        if (!(await validate(value))) {
                            resolve(value);
                        }
                        input.enabled = true;
                        input.busy = false;
                    }),
                    input.onDidChangeValue(async text => {
                        const current = validate(text);
                        validating = current;
                        const validationMessage = await current;
                        if (current === validating) {
                            input.validationMessage = validationMessage;
                        }
                    }),
                    input.onDidHide(() => {
                        (async () => {
                            // no need to use resume logic
                            // reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
                            reject(InputFlowAction.cancel);
                        })()
                            .catch(reject);
                    })
                );
                if (this.current) {
                    this.current.dispose();
                }
                this.current = input;
                this.current.show();
            });
        } finally {
            disposables.forEach(d => d.dispose());
        }
    }
}