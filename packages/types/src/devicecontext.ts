import { Context } from './context';

/**
 * Device context describes the device that caused the event.
 * This is most appropriate for mobile applications.
 * @external https://develop.sentry.dev/sdk/event-payloads/contexts/#device-context
 */
export interface DeviceContext extends Context {
  /**
   * The name of the device. This is typically a hostname.
   */
  name: string;

  /**
   * The family of the device.
   * This is usually the common part of model names across generations.
   * For instance, iPhone would be a reasonable family, so would be Samsung Galaxy.
   */
  family?: string;

  /**
   * The model name.
   * This, for example, can be Samsung Galaxy S3.
   */
  model?: string;

  /**
   * An internal hardware revision to identify the device exactly.
   */
  model_id?: string;

  /**
   * The CPU architecture.
   */
  arch?: string;

  /**
   * If the device has a battery,
   * this can be a floating point value defining the battery level (in the range 0-100).
   */
  battery_level?: number;

  /**
   * This can be a string portrait or landscape to define the orientation of a device.
   */
  orientation?: string;

  /**
   * The manufacturer of the device.
   */
  manufacturer?: string;

  /**
   * The brand of the device.
   */
  brand?: string;

  /**
   * The screen resolution. (e.g.: 800x600, 3040x1444).
   */
  screen_resolution?: string;

  /**
   * A floating point denoting the screen density.
   */
  screen_density?: number;

  /**
   * A decimal value reflecting the DPI (dots-per-inch) density.
   */
  screen_dpi?: number;

  /**
   * Whether the device was online or not.
   */
  online?: boolean;

  /**
   * Whether the device was charging or not.
   */
  charging?: boolean;

  /**
   * Whether the device was low on memory.
   */
  low_memory?: boolean;

  /**
   * A flag indicating whether this device is a simulator or an actual device.
   */
  simulator?: boolean;

  /**
   * Total system memory available in bytes.
   */
  memory_size?: number;

  /**
   * Free system memory in bytes.
   */
  free_memory?: number;

  /**
   * Memory usable for the app in bytes.
   */
  usable_memory?: number;

  /**
   * Total device storage in bytes.
   */
  storage_size?: number;

  /**
   * Free device storage in bytes.
   */
  free_storage?: number;

  /**
   * Total size of an attached external storage in bytes (for example, android SDK card).
   */
  external_storage_size?: number;

  /**
   * Free size of an attached external storage in bytes (for example, android SDK card).
   */
  external_free_storage?: number;

  /**
   * A UTC timestamp when the system was booted.
   */
  boot_time?: number;

  /**
   * The timezone of the device. For example, Europe/Vienna.
   */
  timezone?: string;
}
