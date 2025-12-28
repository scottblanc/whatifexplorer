import { NextRequest, NextResponse } from 'next/server';
import { recalibrateModel } from '@/lib/llm';
import type { CausalModel } from '@/types/causal';

export async function POST(request: NextRequest) {
  try {
    const { model, sensitivityReport } = await request.json();

    if (!model) {
      return NextResponse.json(
        { error: 'Model is required' },
        { status: 400 }
      );
    }

    if (!sensitivityReport) {
      return NextResponse.json(
        { error: 'Sensitivity report is required' },
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

    const result = await recalibrateModel(model as CausalModel, sensitivityReport, apiKey);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error recalibrating model:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to recalibrate model' },
      { status: 500 }
    );
  }
}
