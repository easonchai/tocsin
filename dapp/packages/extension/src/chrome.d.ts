// The few chrome.* calls this extension makes; @types/chrome is not installed and adding it is a new dependency.
declare namespace chrome {
  namespace runtime {
    const id: string;
    function getURL(path: string): string;
    function sendMessage<T = unknown>(message: unknown): Promise<T>;
    type MessageSender = { id?: string; url?: string; tab?: { id?: number } };
    const onMessage: {
      addListener(cb: (message: unknown, sender: MessageSender, sendResponse: (response?: unknown) => void) => boolean | undefined): void;
    };
    const onStartup: { addListener(cb: () => void): void };
    const onInstalled: { addListener(cb: () => void): void };
  }
  namespace storage {
    const local: { get(key: string): Promise<Record<string, unknown>>; set(items: Record<string, unknown>): Promise<void> };
  }
  namespace offscreen {
    function createDocument(o: { url: string; reasons: string[]; justification: string }): Promise<void>;
    function hasDocument(): Promise<boolean>;
  }
}

/** Build-time settings from build.mjs; docs/operator.md step 8 lists the variables. */
declare const __TOCSIN_CONFIG__: {
  sepoliaConsensus: string;
  sepoliaExecution: string;
  mainnetConsensus: string;
  mainnetExecution: string;
  torGateways: string[];
  transport: string;
  listName: string;
  listRecord: string;
  fromBlock: string;
};
