import { NextResponse } from 'next/server';
import { getServiceWalletInfo, verifyServiceWalletSetup } from '@/lib/service-wallet';

/**
 * 서비스 제공자 지갑 정보 조회 API
 * 
 * GET /api/service-wallet-info
 * 
 * 서버 사이드에서 서비스 제공자 지갑의 정보를 조회합니다.
 * 
 * @returns {Object} 지갑 정보 (주소, 잔액, 네트워크)
 */
export async function GET() {
  try {
    
    // 환경 변수 확인
    const serviceProviderKey = process.env.SERVICE_PROVIDER_PRIVATE_KEY;
    if (!serviceProviderKey) {
      return NextResponse.json(
        {
          success: false,
          error: '서비스 제공자 지갑이 설정되지 않았습니다. SERVICE_PROVIDER_PRIVATE_KEY 환경 변수를 확인하세요.',
        },
        { status: 500 }
      );
    }
    
    // 지갑 검증
    const isValid = await verifyServiceWalletSetup();
    if (!isValid) {
      return NextResponse.json(
        {
          success: false,
          error: '서비스 제공자 지갑 검증에 실패했습니다.',
        },
        { status: 500 }
      );
    }
    
    // 지갑 정보 조회
    const info = await getServiceWalletInfo();
    
    
    return NextResponse.json({
      success: true,
      data: {
        address: info.address,
        balance: info.balance,
        network: info.network,
        balanceWarning: parseFloat(info.balance) < 0.01 ? '⚠️ 잔액이 부족합니다. 테스트 ETH를 충전하세요.' : null,
      },
    });
  } catch (error: any) {
    
    return NextResponse.json(
      {
        success: false,
        error: error.message || '알 수 없는 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}

