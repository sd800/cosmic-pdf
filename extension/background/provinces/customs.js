// Customs owns the explicit document-text request boundary, not PDF rendering
// inside Central. Credentials and network access stay outside the PDF sandbox.
import { createAiExplanationProduct } from '../products/ai-explanation.js';
import { createAiWebsiteProduct } from '../products/ai-website.js';
export const aiExplanation = createAiExplanationProduct();
export const aiWebsite = createAiWebsiteProduct();
