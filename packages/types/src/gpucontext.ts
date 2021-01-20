import { Context } from './context';

/**
 * GPU context describes the GPU of the device.
 * @external https://develop.sentry.dev/sdk/event-payloads/contexts/#gpu-context
 */
export interface GpuContext extends Context {
  /**
   * The name of the graphics device.
   */
  name: string;

  /**
   *  The Version of the graphics device.
   */
  version?: string;

  /**
   * The PCI identifier of the graphics device.
   */
  id?: string;

  /**
   * The PCI vendor identifier of the graphics device.
   */
  vendor_id?: string;

  /**
   * The vendor name as reported by the graphics device.
   */
  vendor_name?: string;

  /**
   * The total GPU memory available in Megabytes.
   */
  memory_size?: number;

  /**
   * The device low-level API type.
   * Examples: "Apple Metal" or "Direct3D11"
   */
  api_type?: string;

  /**
   *  Whether the GPU has multi-threaded rendering or not.
   */
  multi_threaded_rendering?: boolean;

  /**
   * The Non-Power-Of-Two-Support support.
   */
  npot_support?: boolean;
}
