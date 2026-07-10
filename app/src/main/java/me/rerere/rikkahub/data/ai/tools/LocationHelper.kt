package me.rerere.rikkahub.data.ai.tools

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

/**
 * 位置获取工具
 *
 * 仅依赖 [LocationManager.getLastKnownLocation] 会返回系统缓存的上一次定位结果，
 * 即便位置已严重过期（例如停留在数天前）。这里在缓存为空或过期时主动发起一次
 * [LocationManager.requestLocationUpdates] 单次定位，保证拿到的是较新的坐标。
 */
internal object LocationHelper {

    /** 认为缓存定位仍可用的最大时长（5 分钟） */
    private const val MAX_CACHE_AGE_MS = 5 * 60 * 1000L

    /**
     * 获取一次较新的定位。
     * 优先用未过期的缓存定位；缓存为空或已过期时主动请求一次新定位（最长等待 10s）。
     */
    @SuppressLint("MissingPermission")
    suspend fun getCurrentLocation(context: Context): Location? = withContext(Dispatchers.IO) {
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
            ?: return@withContext null

        val cached = getCachedLocation(lm)
        val now = System.currentTimeMillis()
        if (cached != null && now - cached.time <= MAX_CACHE_AGE_MS) {
            return@withContext cached
        }

        // 缓存为空或已过期，主动请求一次新定位
        requestFreshLocation(lm) ?: cached
    }

    @SuppressLint("MissingPermission")
    private fun getCachedLocation(lm: LocationManager): Location? {
        val providers = lm.getProviders(true)
        return providers.mapNotNull { lm.getLastKnownLocation(it) }
            .maxByOrNull { it.accuracy }
    }

    @SuppressLint("MissingPermission")
    private suspend fun requestFreshLocation(lm: LocationManager): Location? {
        return try {
            withTimeoutOrNull(10_000L) {
                suspendCancellableCoroutine<Location?> { cont ->
                    val providers = lm.getProviders(true)
                    val bestProvider = providers.firstOrNull()
                        ?: lm.getProvider(LocationManager.GPS_PROVIDER)?.let { LocationManager.GPS_PROVIDER }
                        ?: lm.getProvider(LocationManager.NETWORK_PROVIDER)?.let { LocationManager.NETWORK_PROVIDER }
                        ?: return@suspendCancellableCoroutine cont.resume(null)

                    val listener = object : LocationListener {
                        override fun onLocationChanged(location: Location) {
                            lm.removeUpdates(this)
                            if (cont.isActive) cont.resume(location)
                        }

                        override fun onProviderDisabled(provider: String) {
                            lm.removeUpdates(this)
                            if (cont.isActive) cont.resume(null)
                        }

                        @Deprecated("Deprecated in Java")
                        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}

                        override fun onProviderEnabled(provider: String) {}
                    }

                    cont.invokeOnCancellation {
                        lm.removeUpdates(listener)
                    }

                    lm.requestLocationUpdates(bestProvider, 0L, 0f, listener)
                }
            }
        } catch (_: Exception) {
            null
        }
    }
}
