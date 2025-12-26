import { NextRequest, NextResponse } from 'next/server';
import { generateCausalModel } from '@/lib/llm';

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY not configured' },
        { status: 500 }
      );
    }

    const model = await generateCausalModel(query, apiKey);

    return NextResponse.json({ model });
  } catch (error) {
    console.error('Error generating model:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate model' },
      { status: 500 }
    );
  }
}
