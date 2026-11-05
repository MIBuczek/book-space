import {INotificationTemplate} from './templates';

/**
 * The template values, keyed by placeholder name. An optional variable is absent (or an empty
 * string) rather than present-and-empty, so the optional block that guards it is dropped.
 */
type TTemplateVariables = Record<string, string | undefined>;

/** The rendered message: the subject and the body, both with every placeholder resolved. */
interface IRenderedTemplate {
  subject: string;
  text: string;
}

/** A required `{{name}}`. */
const REQUIRED = /\{\{(\w+)\}\}/g;

/**
 * An optional `{{#name}}…{{/name}}` block, plus the newline that follows it.
 *
 * The newline is part of the match so a dropped block does not leave a blank line behind: a
 * booking without a company would otherwise render an empty line between `Osoba` and `Email`.
 * The capture is non-greedy, and the closing tag is back-referenced to the opening name, so a
 * block cannot swallow the next one.
 */
const OPTIONAL = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}(\n?)/g;

/** Whether an optional value is present and worth rendering. */
const isPresent = (value: string | undefined): value is string => value !== undefined && value !== '';

/**
 * Fills a template, dropping optional blocks whose value is absent and refusing to return a
 * string that still contains a placeholder.
 *
 * A required variable must be supplied and non-empty. An empty value is treated as absent for
 * the same reason as an unsupplied one: a required field that rendered blank ships a silently
 * incomplete e-mail, which is the failure this check exists to prevent.
 *
 * The final check is the point of the whole exercise: a template that names a variable its
 * caller does not supply would otherwise ship `{{club}}` to a facility inbox, and nothing
 * downstream would notice. Failing here turns that into a `502` the operator sees (FR-036)
 * rather than a broken e-mail.
 */
const render = (template: string, variables: TTemplateVariables): string => {
  const withOptionalBlocks = template.replace(OPTIONAL, (_match, name: string, inner: string, newline: string) =>
    isPresent(variables[name]) ? inner + newline : ''
  );

  const rendered = withOptionalBlocks.replace(REQUIRED, (_match, name: string) => {
    const value = variables[name];
    if (!isPresent(value)) {
      throw new Error(`Notification template placeholder "{{${name}}}" was not supplied`);
    }
    return value;
  });

  if (rendered.includes('{{')) {
    throw new Error('Notification template left an unresolved placeholder');
  }

  return rendered;
};

/** Renders a template's subject and body together. */
const renderTemplate = (
  template: INotificationTemplate,
  variables: TTemplateVariables
): IRenderedTemplate => ({
  subject: render(template.subject, variables),
  text: render(template.body, variables),
});

/**
 * The required placeholders a template declares, in first-seen order and de-duplicated.
 *
 * The optional blocks are stripped first, so a placeholder that only ever appears inside a
 * block is not reported as required — otherwise `club` would be demanded of every booking.
 */
const requiredVariables = (template: INotificationTemplate): string[] => {
  const outsideBlocks = template.body.replace(OPTIONAL, '');
  const seen = new Set<string>();
  for (const match of `${template.subject}\n${outsideBlocks}`.matchAll(REQUIRED)) {
    seen.add(match[1]);
  }
  return [...seen];
};

/** The optional placeholders a template declares (the names of its optional blocks). */
const optionalVariables = (template: INotificationTemplate): string[] => {
  const seen = new Set<string>();
  for (const match of template.body.matchAll(OPTIONAL)) {
    seen.add(match[1]);
  }
  return [...seen];
};

export {render, renderTemplate, requiredVariables, optionalVariables};
export type {TTemplateVariables, IRenderedTemplate};
