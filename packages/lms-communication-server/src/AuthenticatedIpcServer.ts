import { type SimpleLogger } from "@lmstudio/lms-common";
import { authPacketSchema, type BackendInterface } from "@lmstudio/lms-communication";
import type { IpcMain, IpcMainEvent } from "electron";
import { type ClientHolder } from "./AuthenticatedWsServer";
import { type Authenticator, type Context, type ContextCreator } from "./Authenticator";
import { IpcServer } from "./IpcServer";
import { IpcServerTransport } from "./IpcServerTransport";
import { ServerPort } from "./ServerPort";

interface Opts<TContext extends Context> {
  backendInterface: BackendInterface<TContext>;
  authenticator: Authenticator<TContext>;
  ipcMain: IpcMain;
  channel: string;
  parentLogger?: SimpleLogger;
}

export class AuthenticatedIpcServer<TContext extends Context> extends IpcServer<TContext> {
  protected override readonly logger: SimpleLogger = this.logger.subclass("AuthenticatedIpcServer");
  private readonly authenticator: Authenticator<TContext>;
  public constructor({
    backendInterface,
    authenticator,
    ipcMain,
    channel,
    parentLogger,
  }: Opts<TContext>) {
    super(backendInterface, ipcMain, channel, parentLogger);
    this.authenticator = authenticator;
  }
  protected override async onConnection(
    event: IpcMainEvent,
    ...data: Array<unknown>
  ): Promise<void> {
    if (event.ports.length !== 1) {
      this.logger.error(
        "Invalid number of ports received. IPC communication will not be established.",
      );
      return;
    }
    let parsed;
    try {
      parsed = authPacketSchema.parse(data);
    } catch (error) {
      this.logger.warn("Received invalid message from client while authenticating:", data);
      return;
    }
    let holder: ClientHolder;
    let contextCreator: ContextCreator<TContext>;
    try {
      ({ holder, contextCreator } = await this.authenticator.authenticate(parsed));
    } catch (error) {
      this.logger.warn("Failed to authenticate client:", error);
      return;
    }
    const serverPort = new ServerPort(
      this.backendInterface,
      contextCreator,
      IpcServerTransport.createFactory(event.ports[0]),
    );
    serverPort.closeEvent.subscribe(() => {
      holder.drop();
    });
  }
}
