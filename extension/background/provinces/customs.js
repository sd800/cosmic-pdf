// Customs owns the explicit document-text request boundary, not PDF rendering
// inside Central. Credentials and network access stay outside the PDF sandbox.
import { createAiExplanationProduct } from '../products/ai-explanation.js';
export const aiExplanation = createAiExplanationProduct();
