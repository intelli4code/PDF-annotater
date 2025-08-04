'use server';
/**
 * @fileOverview A text summarization AI flow.
 *
 * - summarizeText - A function that handles the text summarization.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const SummarizeTextInputSchema = z.object({
  text: z.string().describe('The text to summarize.'),
});
export type SummarizeTextInput = z.infer<typeof SummarizeTextInputSchema>;

const prompt = ai.definePrompt({
  name: 'summarizeTextPrompt',
  input: { schema: SummarizeTextInputSchema },
  prompt: `Summarize the following text concisely:\n\n---\n\n{{text}}`,
});

const summarizeTextFlow = ai.defineFlow(
  {
    name: 'summarizeTextFlow',
    inputSchema: SummarizeTextInputSchema,
    outputSchema: z.string(),
  },
  async (input) => {
    const { output } = await prompt(input);
    return output ?? '';
  }
);

export async function summarizeText(text: string): Promise<string> {
    return summarizeTextFlow({ text });
}
