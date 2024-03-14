declare module 'preact' {
  export type ComponentChild =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    VNode<any> | object | string | number | bigint | boolean | null | undefined;
  export type ComponentChildren = ComponentChild[] | ComponentChild;

  export function h(
    type: 'input',
    props: (JSX.DOMAttributes<HTMLInputElement> & ClassAttributes<HTMLInputElement>) | null,
    ...children: ComponentChildren[]
  ): VNode<JSX.DOMAttributes<HTMLInputElement> & ClassAttributes<HTMLInputElement>>;
  export function h<P extends JSX.HTMLAttributes<T>, T extends HTMLElement>(
    type: keyof JSX.IntrinsicElements,
    props: (ClassAttributes<T> & P) | null,
    ...children: ComponentChildren[]
  ): VNode<ClassAttributes<T> & P>;
  export function h<P extends JSX.SVGAttributes<T>, T extends HTMLElement>(
    type: keyof JSX.IntrinsicElements,
    props: (ClassAttributes<T> & P) | null,
    ...children: ComponentChildren[]
  ): VNode<ClassAttributes<T> & P>;
  export function h<T extends HTMLElement>(
    type: string,
    props: (ClassAttributes<T> & JSX.HTMLAttributes & JSX.SVGAttributes) | null,
    ...children: ComponentChildren[]
  ): VNode<(ClassAttributes<T> & JSX.HTMLAttributes & JSX.SVGAttributes) | null>;
  export function h<P>(
    type: ComponentType<P>,
    props: (Attributes & P) | null,
    ...children: ComponentChildren[]
  ): VNode<Attributes & P>;

  export function render(vnode: ComponentChild, parent: ContainerNode): void;

  // eslint-disable-next-line @typescript-eslint/ban-types
  export interface VNode<P = {}> {
    type: ComponentType<P> | string;
    props: P & { children: ComponentChildren };
    key: Key;
    /**
     * ref is not guaranteed by React.ReactElement, for compatibility reasons
     * with popular react libs we define it as optional too
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ref?: Ref<any> | null;
    /**
     * The time this `vnode` started rendering. Will only be set when
     * the devtools are attached.
     * Default value: `0`
     */
    startTime?: number;
    /**
     * The time that the rendering of this `vnode` was completed. Will only be
     * set when the devtools are attached.
     * Default value: `-1`
     */
    endTime?: number;
  }

  // eslint-disable-next-line @typescript-eslint/ban-types
  export const Fragment: FunctionComponent<{}>;

  // eslint-disable-next-line @typescript-eslint/ban-types
  export type ComponentType<P = {}> = ComponentClass<P> | FunctionComponent<P>;

  export const JSX = JSX;
}
